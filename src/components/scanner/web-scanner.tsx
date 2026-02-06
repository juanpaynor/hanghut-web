'use client'

import React, { useEffect, useState, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { processScan, ScanResult, getEventCheckInStats } from '@/lib/scanner/scan-actions'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Camera, Keyboard, XCircle, CheckCircle, Search, QrCode, Users } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface WebScannerProps {
    events: { id: string, title: string, start_datetime: string | null }[] // Fixed column
}

export function WebScanner({ events }: WebScannerProps) {
    // Auto-select the most recent event (first one likely if sorted by start date desc)
    // Actually typically upcoming events are sorted asc, past desc. 
    // Assuming the passed list is relevant.
    const [selectedEventId, setSelectedEventId] = useState<string>(events[0]?.id || '')

    const [isCameraActive, setIsCameraActive] = useState(false)
    const [lastResult, setLastResult] = useState<ScanResult | null>(null)
    const [loading, setLoading] = useState(false)
    const [manualCode, setManualCode] = useState('')

    // Check-in stats
    const [stats, setStats] = useState<{ total: number, checkedIn: number } | null>(null)
    const [statsLoading, setStatsLoading] = useState(false)

    const { toast } = useToast()

    // Buffer for Bluetooth Scanner
    const bufferRef = useRef('')
    const lastKeyTimeRef = useRef(Date.now())

    // Scan Cooldown Refs
    const lastScannedCodeRef = useRef<string>('')
    const lastScanTimeRef = useRef<number>(0)
    const isProcessingRef = useRef(false)
    const isResultDisplayedRef = useRef(false)

    const eventIdRef = useRef(selectedEventId)
    useEffect(() => { eventIdRef.current = selectedEventId }, [selectedEventId])

    // Initialize Camera
    useEffect(() => {
        let scanner: Html5Qrcode | null = null

        if (isCameraActive && selectedEventId) {
            scanner = new Html5Qrcode("reader")
            const config = { fps: 10, qrbox: { width: 250, height: 250 } }

            scanner.start(
                { facingMode: "environment" },
                config,
                (decodedText) => {
                    handleScan(decodedText)
                },
                (errorMessage) => {
                    // ignore
                }
            ).catch(err => {
                console.error("Camera Error:", err)
                setIsCameraActive(false)
                toast({
                    title: "Camera Error",
                    description: "Could not start camera. Check permissions.",
                    variant: "destructive"
                })
            })
        }

        return () => {
            if (scanner && scanner.isScanning) {
                scanner.stop().then(() => scanner.clear()).catch(console.error)
            }
        }
    }, [isCameraActive, selectedEventId])

    // Keyboard Listener (Bluetooth Scanner)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement
            // Ignore inputs unless it's the manual entry likely? 
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

            const now = Date.now()
            // Reset buffer if gap is > 50ms (Scanners are super fast, typing is slower)
            // 50-100ms is a safe window.
            if (now - lastKeyTimeRef.current > 100) {
                bufferRef.current = ''
            }
            lastKeyTimeRef.current = now

            if (e.key === 'Enter') {
                if (bufferRef.current.length > 5) { // QR codes are usually UUIDs (36 chars) or Signed strings
                    console.log('Bluetooth Scan Detected:', bufferRef.current)

                    // Force unlock for bluetooth rapid scanning
                    isResultDisplayedRef.current = false
                    setLastResult(null)

                    handleScan(bufferRef.current)
                }
                bufferRef.current = ''
            } else if (e.key.length === 1) {
                bufferRef.current += e.key
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [selectedEventId])

    const handleScan = async (code: string) => {
        const now = Date.now()

        // 1. Pause Check: If result is open, ignore everything
        if (isResultDisplayedRef.current) return

        // 2. Cooldown Check (Prevent duplicate scans of SAME code within 3 seconds)
        if (code === lastScannedCodeRef.current && (now - lastScanTimeRef.current < 3000)) {
            return
        }

        // 3. Process Lock
        if (loading || isProcessingRef.current) return

        const targetEventId = eventIdRef.current

        if (!targetEventId) {
            toast({
                title: "Select Event",
                description: "Please select an event first.",
                variant: "destructive"
            })
            return
        }

        // Lock
        isProcessingRef.current = true
        setLoading(true)
        setLastResult(null)

        // Update Refs
        lastScannedCodeRef.current = code
        lastScanTimeRef.current = now

        try {
            // Optimistic UI?
            const result = await processScan(code, targetEventId)
            setLastResult(result)
            isResultDisplayedRef.current = true // Pause!

            if (result.success) {
                toast({
                    title: "Valid Ticket!",
                    description: result.ticket?.guestName ? `Welcome, ${result.ticket.guestName}` : "Entry Approved",
                    className: "bg-green-500 text-white border-none"
                })
                // Refresh stats after successful scan
                fetchStats()
            } else {
                toast({
                    title: result.message,
                    description: result.details || "Entry Denied",
                    variant: "destructive"
                })
            }
        } catch (err) {
            console.error(err)
            toast({
                title: "Scan Failed",
                description: "An unexpected error occurred.",
                variant: "destructive"
            })
        } finally {
            setLoading(false)
            isProcessingRef.current = false
        }
    }

    // Fetch check-in stats
    const fetchStats = async () => {
        if (!selectedEventId) return
        setStatsLoading(true)
        try {
            const data = await getEventCheckInStats(selectedEventId)
            setStats(data)
        } catch (error) {
            console.error('Failed to fetch stats:', error)
        } finally {
            setStatsLoading(false)
        }
    }

    // Fetch stats on mount and when event changes
    useEffect(() => {
        fetchStats()
        // Set up auto-refresh every 30 seconds
        const interval = setInterval(fetchStats, 30000)
        return () => clearInterval(interval)
    }, [selectedEventId])

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (manualCode) handleScan(manualCode)
    }

    // Helper to clear result and unpause
    const clearResult = () => {
        setLastResult(null)
        isResultDisplayedRef.current = false
    }

    if (events.length === 0) {
        return (
            <div className="text-center p-8">
                <p className="text-muted-foreground">No active events found for this account.</p>
            </div>
        )
    }

    return (
        <div className="max-w-md mx-auto p-4 space-y-6">

            {/* Event Selector */}
            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                    <SelectTrigger className="w-full bg-white">
                        <SelectValue placeholder="Select Event to Scan" />
                    </SelectTrigger>
                    <SelectContent>
                        {events.map(event => (
                            <SelectItem key={event.id} value={event.id}>
                                {event.title}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Check-in Stats */}
                {stats && selectedEventId && (
                    <div className="flex items-center justify-between mt-2 px-2 py-1.5 bg-white rounded-md border border-slate-200">
                        <div className="flex items-center gap-2 text-sm">
                            <Users className="w-4 h-4 text-slate-500" />
                            <span className="font-medium text-slate-700">Check-ins</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="text-lg font-bold text-green-600">{stats.checkedIn}</span>
                            <span className="text-slate-400">/</span>
                            <span className="text-sm font-medium text-slate-600">{stats.total}</span>
                        </div>
                    </div>
                )}
            </div>


            {/* Control Bar */}
            <div className="flex justify-between items-center bg-muted/30 p-2 rounded-full">
                <Button
                    variant={isCameraActive ? "destructive" : "default"}
                    onClick={() => setIsCameraActive(!isCameraActive)}
                    className="rounded-full w-1/2"
                >
                    <Camera className="w-4 h-4 mr-2" />
                    {isCameraActive ? 'Stop Camera' : 'Start Camera'}
                </Button>
                <div className="text-xs text-muted-foreground px-4 text-center">OR</div>
                <div className="flex items-center justify-center w-1/2 text-sm text-muted-foreground font-medium">
                    <Keyboard className="w-4 h-4 mr-2" />
                    Scan / Type
                </div>
            </div>

            {/* Camera Viewport */}
            {isCameraActive && (
                <div className="aspect-square bg-black rounded-xl overflow-hidden relative shadow-lg">
                    <div id="reader" className="w-full h-full"></div>
                    <div className="absolute inset-0 border-2 border-white/30 pointer-events-none rounded-xl flex items-center justify-center">
                        <QrCode className="w-12 h-12 text-white/50" />
                    </div>
                </div>
            )}

            {/* Result Display */}
            {lastResult && (
                <Card className={`p-6 text-center animate-in zoom-in-95 duration-200 border-2 ${lastResult.success ? 'border-green-500/50 bg-green-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
                    {lastResult.success ? (
                        <div className="space-y-4">
                            <div className="mx-auto w-16 h-16 bg-green-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-green-500/20 animate-bounce">
                                <CheckCircle className="w-8 h-8" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-green-700">VALID TICKET</h2>
                                {lastResult.ticket && (
                                    <>
                                        <p className="text-green-800/80 font-medium mt-1">{lastResult.ticket.ticket_tiers?.name}</p>
                                        <div className="bg-white/60 p-3 rounded-lg text-sm mt-3 backdrop-blur-sm">
                                            <p className="text-muted-foreground uppercase text-xs tracking-wider mb-1">Guest</p>
                                            <p className="font-semibold text-xl text-slate-900">{lastResult.ticket.guestName}</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="mx-auto w-16 h-16 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-red-500/20 shake">
                                <XCircle className="w-8 h-8" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-red-700">{lastResult.message}</h2>
                                {lastResult.details && (
                                    <p className="text-red-900 font-medium mt-2 bg-red-200/50 py-1 px-2 rounded">{lastResult.details}</p>
                                )}
                            </div>
                        </div>
                    )}

                    <Button
                        onClick={clearResult}
                        variant="outline"
                        className="mt-6 w-full bg-white/50 hover:bg-white/80 border-0"
                        autoFocus
                    >
                        Scan Next (Enter)
                    </Button>
                </Card>
            )}

            {/* Manual Entry Fallback */}
            {!lastResult && !loading && (
                <form onSubmit={handleManualSubmit} className="pt-4 border-t border-border">
                    <div className="flex gap-2">
                        <Input
                            value={manualCode}
                            onChange={(e) => setManualCode(e.target.value)}
                            placeholder="Manually Enter Ticket ID"
                            className="text-center font-mono"
                        />
                        <Button type="submit" size="icon">
                            <Search className="w-4 h-4" />
                        </Button>
                    </div>
                </form>
            )}

            {loading && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground animate-pulse">
                    <Loader2 className="w-12 h-12 mb-4 animate-spin text-primary" />
                    <p className="font-medium">Verifying Ticket...</p>
                </div>
            )}
        </div>
    )
}
