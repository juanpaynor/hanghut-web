'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Send, Eye, Edit, Code, Users, Calendar, ChevronDown } from 'lucide-react'
import { RichTextEditor } from './rich-text-editor'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'

interface EventOption {
    id: string
    title: string
    start_datetime: string
    tickets_sold: number
}

type AudienceType = 'all_subscribers' | 'event_attendees'

export function CampaignComposer() {
    const [subject, setSubject] = useState('')
    const [content, setContent] = useState('')
    const [sending, setSending] = useState(false)
    const [editorMode, setEditorMode] = useState<'visual' | 'html' | 'preview'>('visual')

    // Audience segmentation state
    const [audienceType, setAudienceType] = useState<AudienceType>('all_subscribers')
    const [selectedEventId, setSelectedEventId] = useState<string>('')
    const [events, setEvents] = useState<EventOption[]>([])
    const [loadingEvents, setLoadingEvents] = useState(false)
    const [audienceCount, setAudienceCount] = useState<number | null>(null)
    const [loadingCount, setLoadingCount] = useState(false)

    const { toast } = useToast()
    const supabase = createClient()

    // Load partner's events on mount
    useEffect(() => {
        loadEvents()
    }, [])

    // Update audience count when selection changes
    useEffect(() => {
        if (audienceType === 'all_subscribers') {
            loadSubscriberCount()
        } else if (selectedEventId) {
            loadEventAttendeeCount(selectedEventId)
        } else {
            setAudienceCount(null)
        }
    }, [audienceType, selectedEventId])

    async function getPartnerId() {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return null

        const { data: partner } = await supabase
            .from('partners')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle()

        if (partner) return partner.id

        const { data: tm } = await supabase
            .from('partner_team_members')
            .select('partner_id')
            .eq('user_id', user.id)
            .maybeSingle()

        return tm?.partner_id || null
    }

    async function loadEvents() {
        setLoadingEvents(true)
        try {
            const partnerId = await getPartnerId()
            if (!partnerId) return

            const { data } = await supabase
                .from('events')
                .select('id, title, start_datetime, tickets_sold')
                .eq('organizer_id', partnerId)
                .order('start_datetime', { ascending: false })
                .limit(50)

            setEvents(data || [])
        } catch (err) {
            console.error('Failed to load events:', err)
        } finally {
            setLoadingEvents(false)
        }
    }

    async function loadSubscriberCount() {
        setLoadingCount(true)
        try {
            const partnerId = await getPartnerId()
            if (!partnerId) return

            const { count } = await supabase
                .from('partner_subscribers')
                .select('*', { count: 'exact', head: true })
                .eq('partner_id', partnerId)
                .eq('is_active', true)

            setAudienceCount(count || 0)
        } catch (err) {
            console.error('Failed to load subscriber count:', err)
        } finally {
            setLoadingCount(false)
        }
    }

    async function loadEventAttendeeCount(eventId: string) {
        setLoadingCount(true)
        try {
            // Count unique emails from completed purchase intents for this event
            const { data: intents } = await supabase
                .from('purchase_intents')
                .select('guest_email')
                .eq('event_id', eventId)
                .in('status', ['completed', 'paid'])

            const uniqueEmails = new Set<string>()
            intents?.forEach((intent: any) => {
                if (intent.guest_email) uniqueEmails.add(intent.guest_email.toLowerCase())
            })

            setAudienceCount(uniqueEmails.size)
        } catch (err) {
            console.error('Failed to load attendee count:', err)
        } finally {
            setLoadingCount(false)
        }
    }

    async function getEventAttendeeEmails(eventId: string): Promise<string[]> {
        const { data: intents } = await supabase
            .from('purchase_intents')
            .select('guest_email')
            .eq('event_id', eventId)
            .in('status', ['completed', 'paid'])

        const uniqueEmails = new Set<string>()
        intents?.forEach((intent: any) => {
            if (intent.guest_email) uniqueEmails.add(intent.guest_email.toLowerCase())
        })

        return Array.from(uniqueEmails)
    }

    const handleSend = async () => {
        if (!subject || !content) {
            toast({
                title: "Missing fields",
                description: "Please provide a subject and email content.",
                variant: "destructive"
            })
            return
        }

        if (audienceType === 'event_attendees' && !selectedEventId) {
            toast({
                title: "Select an event",
                description: "Please select which event's attendees to email.",
                variant: "destructive"
            })
            return
        }

        const audienceLabel = audienceType === 'all_subscribers'
            ? 'ALL active subscribers'
            : `attendees of "${events.find(e => e.id === selectedEventId)?.title}"`

        const confirmSend = window.confirm(`Are you sure you want to send this email to ${audienceLabel}? This cannot be undone.`)
        if (!confirmSend) return

        setSending(true)

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("Not authenticated")

            // Get partner info
            let { data: partner } = await supabase
                .from('partners')
                .select('id, business_name')
                .eq('user_id', user.id)
                .maybeSingle()

            if (!partner) {
                const { data: tm } = await supabase
                    .from('partner_team_members')
                    .select('partner_id')
                    .eq('user_id', user.id)
                    .maybeSingle()

                if (tm?.partner_id) {
                    const { data: pDetails } = await supabase
                        .from('partners')
                        .select('id, business_name')
                        .eq('id', tm.partner_id)
                        .single()
                    partner = pDetails
                }
            }

            if (!partner) throw new Error("Partner profile not found or access denied")

            // Build request body based on audience
            const body: any = {
                partner_id: partner.id,
                subject: subject,
                html_content: content,
                sender_name: partner.business_name
            }

            if (audienceType === 'event_attendees' && selectedEventId) {
                // Get attendee emails and pass them directly
                const emails = await getEventAttendeeEmails(selectedEventId)
                if (emails.length === 0) {
                    throw new Error("No attendee emails found for this event")
                }
                body.target_emails = emails
                body.segment = 'event_attendees'
                body.event_id = selectedEventId
            }

            // Call Edge Function
            const { data, error } = await supabase.functions.invoke('send-promotional-email', { body })

            if (error) throw new Error(error.message || "Failed to call sending service")

            if (!data?.success) {
                throw new Error(data?.error || "Email sending reported failure")
            }

            toast({
                title: "Campaign Sent!",
                description: `Successfully queued email for ${data.sent_count || audienceCount || 'all'} recipients.`,
            })

            setSubject('')
            setContent('')
            setEditorMode('visual')
            setAudienceType('all_subscribers')
            setSelectedEventId('')

        } catch (error: any) {
            console.error('Campaign Error:', error)
            toast({
                title: "Sending Failed",
                description: error.message || "Could not send campaign. Please try again.",
                variant: "destructive"
            })
        } finally {
            setSending(false)
        }
    }

    const selectedEvent = events.find(e => e.id === selectedEventId)

    return (
        <Card className="w-full shadow-md">
            <CardHeader className="pb-4">
                <CardTitle className="text-xl">Create New Campaign</CardTitle>
                <CardDescription>
                    Send a promotional email to your subscribers or event attendees.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-6">
                    {/* Audience Selector */}
                    <div className="space-y-3">
                        <Label className="text-base font-semibold">Audience</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => { setAudienceType('all_subscribers'); setSelectedEventId('') }}
                                className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                                    audienceType === 'all_subscribers'
                                        ? 'border-primary bg-primary/5 shadow-sm'
                                        : 'border-border hover:border-primary/40'
                                }`}
                            >
                                <Users className={`h-5 w-5 shrink-0 ${audienceType === 'all_subscribers' ? 'text-primary' : 'text-muted-foreground'}`} />
                                <div>
                                    <p className="font-medium text-sm">All Subscribers</p>
                                    <p className="text-xs text-muted-foreground">Send to your full subscriber list</p>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setAudienceType('event_attendees')}
                                className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                                    audienceType === 'event_attendees'
                                        ? 'border-primary bg-primary/5 shadow-sm'
                                        : 'border-border hover:border-primary/40'
                                }`}
                            >
                                <Calendar className={`h-5 w-5 shrink-0 ${audienceType === 'event_attendees' ? 'text-primary' : 'text-muted-foreground'}`} />
                                <div>
                                    <p className="font-medium text-sm">Event Attendees</p>
                                    <p className="text-xs text-muted-foreground">Target people who bought tickets</p>
                                </div>
                            </button>
                        </div>

                        {/* Event Picker (shown when event_attendees selected) */}
                        {audienceType === 'event_attendees' && (
                            <div className="space-y-2 animate-in fade-in-50 duration-300">
                                <Label htmlFor="event-select">Select Event</Label>
                                <select
                                    id="event-select"
                                    value={selectedEventId}
                                    onChange={(e) => setSelectedEventId(e.target.value)}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    disabled={loadingEvents}
                                >
                                    <option value="">
                                        {loadingEvents ? 'Loading events...' : '— Choose an event —'}
                                    </option>
                                    {events.map(event => (
                                        <option key={event.id} value={event.id}>
                                            {event.title} — {format(new Date(event.start_datetime), 'MMM d, yyyy')} ({event.tickets_sold} sold)
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Audience count badge */}
                        {audienceCount !== null && (
                            <div className="flex items-center gap-2 animate-in fade-in-50 duration-200">
                                <Badge variant="secondary" className="text-xs">
                                    {loadingCount ? (
                                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                    ) : (
                                        <Users className="h-3 w-3 mr-1" />
                                    )}
                                    {audienceCount} recipient{audienceCount !== 1 ? 's' : ''}
                                </Badge>
                                {audienceType === 'event_attendees' && selectedEvent && (
                                    <span className="text-xs text-muted-foreground">
                                        from {selectedEvent.title}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Subject */}
                    <div className="space-y-2">
                        <Label htmlFor="subject">Email Subject</Label>
                        <Input
                            id="subject"
                            placeholder="e.g., Don't miss our massive weekend sale!"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            className="font-medium"
                        />
                    </div>

                    {/* Editor Tabs */}
                    <Tabs value={editorMode} onValueChange={(v) => setEditorMode(v as any)} className="w-full">
                        <TabsList className="grid w-full grid-cols-3 mb-4">
                            <TabsTrigger value="visual" className="flex items-center gap-2">
                                <Edit className="h-4 w-4" />
                                Visual
                            </TabsTrigger>
                            <TabsTrigger value="html" className="flex items-center gap-2">
                                <Code className="h-4 w-4" />
                                HTML Code
                            </TabsTrigger>
                            <TabsTrigger value="preview" className="flex items-center gap-2">
                                <Eye className="h-4 w-4" />
                                Preview
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="visual" className="space-y-2 animate-in fade-in-50 duration-300">
                            <RichTextEditor
                                value={content}
                                onChange={setContent}
                                disabled={sending}
                            />
                            <p className="text-xs text-muted-foreground">
                                Use the toolbar for formatting. For full HTML templates, switch to the <strong>HTML Code</strong> tab.
                            </p>
                        </TabsContent>

                        <TabsContent value="html" className="space-y-2 animate-in fade-in-50 duration-300">
                            <Textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder={'Paste your HTML email template here...\n\nExample:\n<h1>Hello!</h1>\n<p>Check out our latest events.</p>\n<table>...</table>'}
                                className="min-h-[400px] font-mono text-sm bg-slate-950 text-green-400 border-slate-700 placeholder:text-slate-600"
                                disabled={sending}
                            />
                            <p className="text-xs text-muted-foreground">
                                Paste raw HTML code directly. Supports full email templates with tables, inline styles, and custom layouts.
                            </p>
                        </TabsContent>

                        <TabsContent value="preview" className="space-y-4 animate-in fade-in-50 duration-300">
                            <div className="border rounded-lg p-8 bg-white min-h-[500px] shadow-inner relative">
                                <div className="border-b pb-4 mb-6">
                                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-semibold">Subject</p>
                                    <h3 className="text-xl font-bold text-gray-900 leading-tight">
                                        {subject || <span className="text-gray-300 italic">No subject entered</span>}
                                    </h3>
                                </div>

                                <div
                                    className="prose max-w-none text-gray-800 leading-relaxed space-y-4"
                                    dangerouslySetInnerHTML={{ __html: content || '<p class="text-gray-400 italic text-center py-10">No content yet...</p>' }}
                                />

                                <div className="mt-16 pt-8 border-t border-gray-100 text-center space-y-2">
                                    <p className="text-xs text-gray-400 font-sans">
                                        You received this email because you subscribed to updates from [Business Name].
                                    </p>
                                    <p className="text-xs text-gray-400 font-sans">
                                        <span className="cursor-pointer underline hover:text-gray-600">Unsubscribe</span> from these emails.
                                    </p>
                                </div>
                            </div>
                            <p className="text-xs text-center text-muted-foreground mt-2">
                                This preview approximates how the email will look to recipients.
                            </p>
                        </TabsContent>
                    </Tabs>
                </div>
            </CardContent>
            <CardFooter className="justify-end pt-2 pb-6 px-6">
                <Button
                    onClick={handleSend}
                    disabled={sending || !subject || !content || (audienceType === 'event_attendees' && !selectedEventId)}
                    size="lg"
                    className="w-full sm:w-auto"
                >
                    {sending ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending...
                        </>
                    ) : (
                        <>
                            <Send className="mr-2 h-4 w-4" />
                            Send Campaign
                            {audienceCount !== null && (
                                <Badge variant="secondary" className="ml-2 text-xs">
                                    {audienceCount}
                                </Badge>
                            )}
                        </>
                    )}
                </Button>
            </CardFooter>
        </Card>
    )
}
