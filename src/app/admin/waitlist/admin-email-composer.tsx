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
import { Loader2, Send, Eye, Edit, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'

interface Campaign {
    id: string
    subject: string
    status: string
    sent_at: string | null
    recipient_count: number
    sent_count: number
    failed_count: number
    created_at: string
}

type Audience = 'all' | 'iphone' | 'android'

export function AdminEmailComposer({ waitlistCount }: { waitlistCount: number }) {
    const [subject, setSubject] = useState('')
    const [content, setContent] = useState('')
    const [sending, setSending] = useState(false)
    const [activeTab, setActiveTab] = useState('write')
    const [audience, setAudience] = useState<Audience>('all')
    const [campaigns, setCampaigns] = useState<Campaign[]>([])
    const [loadingHistory, setLoadingHistory] = useState(true)

    const { toast } = useToast()
    const supabase = createClient()

    useEffect(() => {
        loadCampaigns()
    }, [])

    const loadCampaigns = async () => {
        setLoadingHistory(true)
        const { data, error } = await supabase
            .from('admin_email_campaigns')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20)

        if (!error && data) setCampaigns(data)
        setLoadingHistory(false)
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

        const confirmSend = window.confirm(
            `Are you sure you want to send this email to ALL ${waitlistCount} people on the waitlist? This cannot be undone.`
        )
        if (!confirmSend) return

        setSending(true)

        try {
            const { data, error } = await supabase.functions.invoke('send-admin-email', {
                body: {
                    subject,
                    html_content: content,
                    sender_name: 'HangHut',
                    phone_type: audience === 'all' ? undefined : audience,
                }
            })

            if (error) throw new Error(error.message || 'Failed to call sending service')
            if (!data?.success) throw new Error(data?.error || 'Email sending reported failure')

            toast({
                title: "Campaign Sent! 🚀",
                description: `Successfully sent to ${data.sent_count} of ${data.total_recipients} recipients.`,
            })

            setSubject('')
            setContent('')
            setActiveTab('write')
            loadCampaigns()

        } catch (error: any) {
            console.error('Admin Campaign Error:', error)
            toast({
                title: "Sending Failed",
                description: error.message || "Could not send campaign. Please try again.",
                variant: "destructive"
            })
        } finally {
            setSending(false)
        }
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'sent':
                return <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="h-3 w-3 mr-1" /> Sent</Badge>
            case 'partial':
                return <Badge className="bg-yellow-100 text-yellow-700"><Clock className="h-3 w-3 mr-1" /> Partial</Badge>
            case 'failed':
                return <Badge className="bg-red-100 text-red-700"><XCircle className="h-3 w-3 mr-1" /> Failed</Badge>
            default:
                return <Badge variant="secondary">{status}</Badge>
        }
    }

    return (
        <div className="space-y-8">
            {/* Composer */}
            <Card className="shadow-md">
                <CardHeader className="pb-4">
                    <CardTitle className="text-xl">Send to Waitlist</CardTitle>
                    <CardDescription>
                        Compose an email that will be sent to all {waitlistCount} {waitlistCount === 1 ? 'person' : 'people'} on the waitlist as HangHut.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {/* Audience Selector */}
                    <div className="mb-6">
                        <p className="text-sm font-medium mb-2 text-slate-700">Send to</p>
                        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm w-fit">
                            <button
                                onClick={() => setAudience('all')}
                                className={`px-4 py-2 font-medium transition-colors ${
                                    audience === 'all'
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-white text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                All ({waitlistCount})
                            </button>
                            <button
                                onClick={() => setAudience('iphone')}
                                className={`px-4 py-2 font-medium border-l border-slate-200 transition-colors ${
                                    audience === 'iphone'
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-white text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                🍎 iPhone only
                            </button>
                            <button
                                onClick={() => setAudience('android')}
                                className={`px-4 py-2 font-medium border-l border-slate-200 transition-colors ${
                                    audience === 'android'
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-white text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                🤖 Android only
                            </button>
                        </div>
                    </div>
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-2 mb-6">
                            <TabsTrigger value="write" className="flex items-center gap-2">
                                <Edit className="h-4 w-4" />
                                Write
                            </TabsTrigger>
                            <TabsTrigger value="preview" className="flex items-center gap-2">
                                <Eye className="h-4 w-4" />
                                Preview
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="write" className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="subject">Email Subject</Label>
                                <Input
                                    id="subject"
                                    placeholder="e.g., HangHut is launching soon — here's what's coming!"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    className="font-medium"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Email Body (HTML)</Label>
                                <Textarea
                                    placeholder="Write your email content here... HTML is supported."
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    rows={12}
                                    className="font-mono text-sm"
                                />
                            </div>
                        </TabsContent>

                        <TabsContent value="preview" className="space-y-4">
                            <div className="border rounded-lg p-8 bg-white min-h-[300px] shadow-inner">
                                <div className="border-b pb-4 mb-6">
                                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-semibold">Subject</p>
                                    <h3 className="text-xl font-bold text-gray-900">
                                        {subject || <span className="text-gray-300 italic">No subject entered</span>}
                                    </h3>
                                    <p className="text-xs text-gray-400 mt-1">From: HangHut &lt;noreply@hanghut.com&gt;</p>
                                </div>
                                <div
                                    className="prose max-w-none text-gray-800 leading-relaxed"
                                    dangerouslySetInnerHTML={{
                                        __html: content || '<p class="text-gray-400 italic text-center py-10">No content yet...</p>'
                                    }}
                                />
                            </div>
                        </TabsContent>
                    </Tabs>
                </CardContent>
                <CardFooter className="justify-end pt-2 pb-6 px-6">
                    <Button
                        onClick={handleSend}
                        disabled={sending || !subject || !content || waitlistCount === 0}
                        size="lg"
                        className="w-full sm:w-auto"
                    >
                        {sending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Sending to {waitlistCount}...
                            </>
                        ) : (
                        <>
                                <Send className="mr-2 h-4 w-4" />
                                Send to {audience === 'all' ? `All ${waitlistCount}` : audience === 'iphone' ? '🍎 iPhone' : '🤖 Android'} {waitlistCount === 1 ? 'Person' : 'People'}
                            </>
                        )}
                    </Button>
                </CardFooter>
            </Card>

            {/* Campaign History */}
            <Card>
                <CardHeader>
                    <CardTitle>Sent Campaigns</CardTitle>
                    <CardDescription>History of emails sent to the waitlist.</CardDescription>
                </CardHeader>
                <CardContent>
                    {loadingHistory ? (
                        <p className="text-center py-8 text-muted-foreground">Loading...</p>
                    ) : campaigns.length === 0 ? (
                        <p className="text-center py-8 text-muted-foreground">No campaigns sent yet.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left py-2 px-3 text-xs font-bold uppercase text-slate-500">Subject</th>
                                        <th className="text-left py-2 px-3 text-xs font-bold uppercase text-slate-500">Status</th>
                                        <th className="text-left py-2 px-3 text-xs font-bold uppercase text-slate-500">Sent At</th>
                                        <th className="text-right py-2 px-3 text-xs font-bold uppercase text-slate-500">Recipients</th>
                                        <th className="text-right py-2 px-3 text-xs font-bold uppercase text-slate-500">Delivered</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {campaigns.map((c) => (
                                        <tr key={c.id} className="hover:bg-slate-50">
                                            <td className="py-3 px-3 text-sm font-medium">{c.subject}</td>
                                            <td className="py-3 px-3">{getStatusBadge(c.status)}</td>
                                            <td className="py-3 px-3 text-sm text-slate-500">
                                                {c.sent_at ? format(new Date(c.sent_at), 'MMM d, yyyy h:mm a') : '-'}
                                            </td>
                                            <td className="py-3 px-3 text-sm text-right">{c.recipient_count}</td>
                                            <td className="py-3 px-3 text-sm text-right font-medium text-green-600">{c.sent_count}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
