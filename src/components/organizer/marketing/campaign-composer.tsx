'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Send, AlertCircle, Eye, Edit } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export function CampaignComposer() {
    const [subject, setSubject] = useState('')
    const [content, setContent] = useState('')
    const [sending, setSending] = useState(false)
    const [activeTab, setActiveTab] = useState('write')

    const { toast } = useToast()
    const supabase = createClient()

    const handleSend = async () => {
        if (!subject || !content) {
            toast({
                title: "Missing fields",
                description: "Please provide a subject and email content.",
                variant: "destructive"
            })
            return
        }

        const confirmSend = window.confirm("Are you sure you want to send this email to ALL active subscribers? This cannot be undone.")
        if (!confirmSend) return

        setSending(true)

        try {
            // Get partner info to confirm sender name
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("Not authenticated")

            const { data: partner } = await supabase
                .from('partners')
                .select('id, business_name')
                .eq('user_id', user.id)
                .single()

            if (!partner) throw new Error("Partner profile not found")

            // Call Edge Function
            const { data, error } = await supabase.functions.invoke('send-promotional-email', {
                body: {
                    partner_id: partner.id,
                    subject: subject,
                    html_content: content,
                    sender_name: partner.business_name
                }
            })

            if (error) throw new Error(error.message || "Failed to call sending service")

            if (!data?.success) {
                throw new Error(data?.error || "Email sending reported failure")
            }

            toast({
                title: "Campaign Sent!",
                description: `Successfully queued email for ${data.sent_count || 'all'} subscribers.`,
            })

            setSubject('')
            setContent('')
            setActiveTab('write')

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

    return (
        <Card className="w-full shadow-md">
            <CardHeader className="pb-4">
                <CardTitle className="text-xl">Create New Campaign</CardTitle>
                <CardDescription>
                    Send a promotional email to all your active subscribers.
                </CardDescription>
            </CardHeader>
            <CardContent>
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

                    <TabsContent value="write" className="space-y-4 animate-in fade-in-50 duration-300">
                        <Alert className="bg-muted/50 border-input">
                            <AlertCircle className="h-4 w-4 text-primary" />
                            <AlertTitle className="text-primary font-medium">Rich Text Editor</AlertTitle>
                            <AlertDescription className="text-muted-foreground text-xs">
                                For advanced formatting (images, bold, links), please ask your developer to install the <code>tiptap</code> package. Currently using basic text/HTML mode.
                            </AlertDescription>
                        </Alert>

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

                        <div className="space-y-2">
                            <Label htmlFor="content">Email Body (HTML supported)</Label>
                            <Textarea
                                id="content"
                                placeholder="<p>Write your message here...</p>"
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                className="min-h-[400px] font-mono text-sm leading-relaxed"
                            />
                        </div>
                    </TabsContent>

                    <TabsContent value="preview" className="space-y-4 animate-in fade-in-50 duration-300">
                        <div className="border rounded-lg p-8 bg-white min-h-[500px] shadow-inner relative">
                            {/* Email Header Simulation */}
                            <div className="border-b pb-4 mb-6">
                                <p className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-semibold">Subject</p>
                                <h3 className="text-xl font-bold text-gray-900 leading-tight">
                                    {subject || <span className="text-gray-300 italic">No subject entered</span>}
                                </h3>
                            </div>

                            {/* Email Content Simulation */}
                            <div
                                className="prose max-w-none text-gray-800 leading-relaxed space-y-4"
                                dangerouslySetInnerHTML={{ __html: content || '<p class="text-gray-400 italic text-center py-10">No content yet... Switch to "Write" tab to start drafting.</p>' }}
                            />

                            {/* Simulated Footer */}
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
                            This preview approximates how the email will look to recipients. Actual rendering varies by email client.
                        </p>
                    </TabsContent>
                </Tabs>
            </CardContent>
            <CardFooter className="justify-end pt-2 pb-6 px-6">
                <Button
                    onClick={handleSend}
                    disabled={sending || !subject || !content}
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
                        </>
                    )}
                </Button>
            </CardFooter>
        </Card>
    )
}
