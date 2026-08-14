'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Send, Eye, Edit, Code, Users, Calendar, ChevronDown, FileText, Save, Trash2, CalendarClock, Clock, X, Target, LayoutTemplate, CalendarPlus, Bookmark, Plus, Search, Beaker, Sparkles, Wand2, UserCheck } from 'lucide-react'
import { RichTextEditor } from './rich-text-editor'
import { EventCombobox } from './event-combobox'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { format } from 'date-fns'
import { getAudienceCount, getEventAttendeeRecipients, getSegmentRecipients, saveDraft, getDrafts, getDraft, deleteDraft, scheduleCampaign, getScheduledCampaigns, cancelScheduledCampaign, getTemplates, saveAsTemplate, deleteTemplate, buildEventEmailBlock, type EmailTemplate } from '@/lib/marketing/actions'
import { formatInManila } from '@/lib/datetime'

/** datetime-local value (yyyy-MM-ddTHH:mm) in the user's local timezone. */
function toLocalInputValue(d: Date): string {
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    return local.toISOString().slice(0, 16)
}

interface EventOption {
    id: string
    title: string
    start_datetime: string
    tickets_sold: number
}

type AudienceType = 'all_subscribers' | 'event_attendees' | 'customer_segment' | 'specific_customers'

// Customer/RFM segments that can be emailed (resolved server-side to their emails).
const SEGMENT_OPTIONS: { value: string; label: string }[] = [
    { value: 'customers', label: 'All customers' },
    { value: 'champion', label: 'Champions' },
    { value: 'loyal', label: 'Loyal customers' },
    { value: 'new', label: 'New customers' },
    { value: 'at_risk', label: 'At-risk (win-back)' },
    { value: 'lost', label: 'Lost customers' },
    { value: 'repeat', label: 'Repeat buyers' },
    { value: 'no_show', label: 'No-shows' },
    { value: 'abandoned', label: 'Abandoned checkout' },
    { value: 'reengaged', label: 'Re-engaged' },
    { value: 'rejected', label: 'Rejected' },
]
const segmentLabel = (v: string) => SEGMENT_OPTIONS.find((o) => o.value === v)?.label || 'segment'

export function CampaignComposer() {
    const [subject, setSubject] = useState('')
    const [content, setContent] = useState('')
    const [sending, setSending] = useState(false)
    const [sendingTest, setSendingTest] = useState(false)
    const [editorMode, setEditorMode] = useState<'visual' | 'html' | 'preview'>('visual')
    const [editorKey, setEditorKey] = useState(0) // remounts the uncontrolled editor after template/event insert

    // Templates + insert-event (Phase 1)
    const [templates, setTemplates] = useState<EmailTemplate[]>([])
    const [templatesOpen, setTemplatesOpen] = useState(false)
    const [insertEventOpen, setInsertEventOpen] = useState(false)
    const [inserting, setInserting] = useState(false)
    const [saveTplOpen, setSaveTplOpen] = useState(false)
    const [tplName, setTplName] = useState('')

    // Insert-event picker: debounced server-side search, upcoming events only
    const [partnerId, setPartnerId] = useState<string | null>(null)
    const [eventQuery, setEventQuery] = useState('')
    const [insertResults, setInsertResults] = useState<EventOption[]>([])
    const [insertLoading, setInsertLoading] = useState(false)

    // Write with AI (Groq)
    const [aiOpen, setAiOpen] = useState(false)
    const [aiBrief, setAiBrief] = useState('')
    const [aiTone, setAiTone] = useState('Friendly & fun')
    const [aiEventId, setAiEventId] = useState('')
    const [aiGenerating, setAiGenerating] = useState(false)
    const [aiResult, setAiResult] = useState<{ subjects: string[]; preview_text?: string; html: string } | null>(null)
    const [aiSubject, setAiSubject] = useState('')

    // Audience segmentation state
    const [audienceType, setAudienceType] = useState<AudienceType>('all_subscribers')
    const [selectedSegment, setSelectedSegment] = useState<string>('')
    // Hand-picked recipients deep-linked from the Customers page (checkbox selection).
    const [specificRecipients, setSpecificRecipients] = useState<{ email: string; first_name?: string }[]>([])
    const [selectedEventId, setSelectedEventId] = useState<string>('')
    const [events, setEvents] = useState<EventOption[]>([])
    const [loadingEvents, setLoadingEvents] = useState(false)
    const [audienceCount, setAudienceCount] = useState<number | null>(null)
    const [loadingCount, setLoadingCount] = useState(false)

    // Drafts (Phase 6)
    const [draftId, setDraftId] = useState<string | null>(null)
    const [drafts, setDrafts] = useState<{ id: string; subject: string; segment: string | null; updated_at: string }[]>([])
    const [savingDraft, setSavingDraft] = useState(false)

    // Scheduling
    const [scheduleMode, setScheduleMode] = useState(false)
    const [scheduledFor, setScheduledFor] = useState('')
    const [scheduling, setScheduling] = useState(false)
    const [scheduled, setScheduled] = useState<{ id: string; subject: string; segment: string | null; event_id: string | null; scheduled_for: string; status: string; recipient_count: number | null }[]>([])

    const { toast } = useToast()
    const supabase = createClient()

    // Autosave the in-progress email to localStorage so switching marketing tabs
    // (which unmounts this component) — or an accidental reload — never wipes work.
    const AUTOSAVE_KEY = 'hh:composer-autosave-v1'
    const hydratedRef = useRef(false)

    // Load partner's events + drafts + scheduled on mount, then restore autosave.
    useEffect(() => {
        loadEvents()
        refreshDrafts()
        refreshScheduled()
        refreshTemplates()

        // Deep-link from Customer analytics: /organizer/marketing?segment=at_risk
        const params = new URLSearchParams(window.location.search)
        const seg = params.get('segment')

        // Deep-link from the Customers page checkbox selection: hand-picked
        // recipients are handed over via sessionStorage (too many for a URL).
        let picked: { email: string; first_name?: string }[] = []
        if (params.get('recipients') === 'selected') {
            try {
                const raw = sessionStorage.getItem('hh:email-recipients')
                if (raw) {
                    const list = JSON.parse(raw)
                    if (Array.isArray(list)) picked = list.filter((r) => r && r.email)
                }
            } catch { /* ignore */ }
            sessionStorage.removeItem('hh:email-recipients') // consume once
        }
        const hasPicked = picked.length > 0

        // Restore any autosaved draft-in-progress.
        try {
            const raw = localStorage.getItem(AUTOSAVE_KEY)
            if (raw) {
                const s = JSON.parse(raw)
                if (s.subject) setSubject(s.subject)
                if (s.content) {
                    setContent(s.content)
                    setEditorKey((k) => k + 1) // remount the uncontrolled editor with restored content
                }
                if (s.editorMode) setEditorMode(s.editorMode)
                if (s.draftId) setDraftId(s.draftId)
                // Only restore the saved audience if we're not deep-linking a segment
                // or a hand-picked list. A saved 'specific_customers' can't be restored
                // (the list isn't persisted) — fall back to all subscribers.
                if (!seg && !hasPicked) {
                    if (s.audienceType && s.audienceType !== 'specific_customers') setAudienceType(s.audienceType)
                    if (s.selectedSegment) setSelectedSegment(s.selectedSegment)
                    if (s.selectedEventId) setSelectedEventId(s.selectedEventId)
                }
            }
        } catch { /* ignore corrupt autosave */ }

        if (hasPicked) {
            setSpecificRecipients(picked)
            setAudienceType('specific_customers')
            setAudienceCount(picked.length)
        } else if (seg) {
            setAudienceType('customer_segment')
            setSelectedSegment(SEGMENT_OPTIONS.some((o) => o.value === seg) ? seg : 'customers')
        }

        hydratedRef.current = true
    }, [])

    // Persist on every meaningful change (post-hydration). An empty composer
    // clears the autosave — so a successful send/schedule (which resets state)
    // wipes it automatically.
    useEffect(() => {
        if (!hydratedRef.current) return
        try {
            if (subject.trim() || content.trim()) {
                localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
                    subject, content, editorMode, audienceType, selectedSegment, selectedEventId, draftId,
                }))
            } else {
                localStorage.removeItem(AUTOSAVE_KEY)
            }
        } catch { /* storage full / unavailable — non-fatal */ }
    }, [subject, content, editorMode, audienceType, selectedSegment, selectedEventId, draftId])

    async function refreshDrafts() {
        try { setDrafts(await getDrafts() as any) } catch { /* non-fatal */ }
    }

    async function refreshScheduled() {
        try { setScheduled(await getScheduledCampaigns() as any) } catch { /* non-fatal */ }
    }

    async function refreshTemplates() {
        try { setTemplates(await getTemplates()) } catch { /* non-fatal */ }
    }

    function applyTemplate(t: EmailTemplate) {
        if (content.trim() && !window.confirm('Replace the current content with this template?')) return
        setContent(t.html_content)
        setEditorMode('preview')
        setEditorKey((k) => k + 1)
        setTemplatesOpen(false)
        toast({ title: 'Template applied', description: 'Edit the copy, then send.' })
    }

    async function insertEvent(eventId: string) {
        setInserting(true)
        const res = await buildEventEmailBlock(eventId)
        setInserting(false)
        if (res.error || !res.html) {
            toast({ title: 'Could not insert event', description: res.error, variant: 'destructive' })
            return
        }
        setContent((prev) => (prev || '') + res.html)
        setEditorMode('preview')
        setEditorKey((k) => k + 1)
        setInsertEventOpen(false)
        toast({ title: 'Event added', description: 'A live event card was added to your email.' })
    }

    async function generateAiCopy() {
        if (!aiBrief.trim()) {
            toast({ title: 'Add a brief', description: 'Tell the AI what this email is about.', variant: 'destructive' })
            return
        }
        setAiGenerating(true)
        setAiResult(null)
        try {
            const pid = partnerId || await getPartnerId()
            let businessName: string | undefined
            if (pid) {
                const { data: p } = await supabase.from('partners').select('business_name').eq('id', pid).maybeSingle()
                businessName = p?.business_name || undefined
            }
            const { data, error } = await supabase.functions.invoke('ai-marketing-copy', {
                body: { brief: aiBrief, tone: aiTone, event_id: aiEventId || undefined, business_name: businessName },
            })
            if (error) throw new Error(error.message || 'Failed to generate')
            if (data?.error) throw new Error(data.error)
            setAiResult(data)
            setAiSubject(data.subjects?.[0] || '')
        } catch (err: any) {
            toast({ title: 'Could not generate copy', description: err.message, variant: 'destructive' })
        } finally {
            setAiGenerating(false)
        }
    }

    function applyAiCopy() {
        if (!aiResult) return
        if (aiSubject) setSubject(aiSubject)
        setContent(aiResult.html)
        setEditorMode('preview')
        setEditorKey((k) => k + 1)
        setAiOpen(false)
        toast({ title: 'AI copy added', description: 'Review and tweak, then send or test.' })
    }

    async function handleSaveAsTemplate() {
        if (!content.trim()) { toast({ title: 'Nothing to save', variant: 'destructive' }); return }
        const res = await saveAsTemplate(tplName.trim() || 'My template', content)
        if (res.error) { toast({ title: 'Could not save', description: res.error, variant: 'destructive' }); return }
        setSaveTplOpen(false); setTplName(''); refreshTemplates()
        toast({ title: 'Saved as template' })
    }

    async function handleDeleteTemplate(id: string) {
        const res = await deleteTemplate(id)
        if (!res.error) refreshTemplates()
    }

    async function handleSchedule() {
        if (!subject || !content) {
            toast({ title: 'Missing fields', description: 'Please provide a subject and email content.', variant: 'destructive' })
            return
        }
        if (audienceType === 'event_attendees' && !selectedEventId) {
            toast({ title: 'Select an event', description: 'Please select which event to target.', variant: 'destructive' })
            return
        }
        if (audienceType === 'customer_segment' && !selectedSegment) {
            toast({ title: 'Choose a segment', description: 'Please pick a customer segment to target.', variant: 'destructive' })
            return
        }
        if (audienceType === 'specific_customers') {
            toast({ title: 'Send now instead', description: "Scheduling isn't available for a hand-picked list — use Send now.", variant: 'destructive' })
            return
        }
        if (!scheduledFor) {
            toast({ title: 'Pick a time', description: 'Choose when this campaign should send.', variant: 'destructive' })
            return
        }
        setScheduling(true)
        const res = await scheduleCampaign({
            id: draftId ?? undefined,
            subject,
            html_content: content,
            segment: audienceType === 'customer_segment' ? selectedSegment : audienceType,
            event_id: audienceType === 'event_attendees' ? selectedEventId : null,
            scheduled_for: new Date(scheduledFor).toISOString(),
        })
        setScheduling(false)
        if (res.error) {
            toast({ title: 'Could not schedule', description: res.error, variant: 'destructive' })
            return
        }
        toast({ title: 'Campaign scheduled', description: `Will send ${format(new Date(scheduledFor), 'MMM d, h:mm a')}.` })
        setSubject(''); setContent(''); setEditorMode('visual')
        setAudienceType('all_subscribers'); setSelectedEventId(''); setSelectedSegment('')
        setDraftId(null); setScheduleMode(false); setScheduledFor('')
        refreshScheduled(); refreshDrafts()
    }

    async function handleCancelScheduled(id: string) {
        const res = await cancelScheduledCampaign(id)
        if (res.error) { toast({ title: 'Could not cancel', description: res.error, variant: 'destructive' }); return }
        refreshScheduled()
        toast({ title: 'Scheduled campaign cancelled' })
    }

    async function handleSaveDraft() {
        if (!subject && !content) {
            toast({ title: 'Nothing to save', description: 'Add a subject or content first.', variant: 'destructive' })
            return
        }
        setSavingDraft(true)
        const res = await saveDraft({
            id: draftId ?? undefined,
            subject,
            html_content: content,
            segment: audienceType === 'customer_segment' ? selectedSegment : audienceType,
            event_id: audienceType === 'event_attendees' ? (selectedEventId || null) : null,
        })
        setSavingDraft(false)
        if (res.error) {
            toast({ title: 'Could not save draft', description: res.error, variant: 'destructive' })
            return
        }
        setDraftId(res.id!)
        refreshDrafts()
        toast({ title: 'Draft saved' })
    }

    async function handleResumeDraft(id: string) {
        const d = await getDraft(id)
        if (!d) { toast({ title: 'Draft not found', variant: 'destructive' }); refreshDrafts(); return }
        setDraftId(d.id)
        setSubject(d.subject === '(no subject)' ? '' : d.subject)
        setContent(d.html_content || '')
        if (d.segment === 'event_attendees') {
            setAudienceType('event_attendees')
            setSelectedEventId(d.event_id || '')
            setSelectedSegment('')
        } else if (d.segment && d.segment !== 'all_subscribers') {
            setAudienceType('customer_segment')
            setSelectedSegment(d.segment)
            setSelectedEventId('')
        } else {
            setAudienceType('all_subscribers')
            setSelectedEventId('')
            setSelectedSegment('')
        }
        setEditorMode('visual')
        toast({ title: 'Draft loaded', description: 'Edit and send, or keep saving.' })
    }

    async function handleDeleteDraft(id: string) {
        const res = await deleteDraft(id)
        if (res.error) { toast({ title: 'Could not delete', description: res.error, variant: 'destructive' }); return }
        if (draftId === id) setDraftId(null)
        refreshDrafts()
    }

    // Update audience count when selection changes
    useEffect(() => {
        if (audienceType === 'event_attendees' && !selectedEventId) {
            setAudienceCount(null)
            return
        }
        if (audienceType === 'customer_segment' && !selectedSegment) {
            setAudienceCount(null)
            return
        }
        loadAudienceCount()
    }, [audienceType, selectedEventId, selectedSegment])

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
            const pid = await getPartnerId()
            if (!pid) return
            setPartnerId(pid)

            const { data } = await supabase
                .from('events')
                .select('id, title, start_datetime, tickets_sold')
                .eq('organizer_id', pid)
                .order('start_datetime', { ascending: false })
                .limit(50)

            setEvents(data || [])
        } catch (err) {
            console.error('Failed to load events:', err)
        } finally {
            setLoadingEvents(false)
        }
    }

    // Insert-event picker: search only upcoming events, server-side + debounced,
    // so it stays correct even for organizers with hundreds of events.
    async function searchInsertEvents(q: string) {
        setInsertLoading(true)
        try {
            const pid = partnerId || await getPartnerId()
            if (!pid) return
            const todayStart = new Date()
            todayStart.setHours(0, 0, 0, 0)
            let query = supabase
                .from('events')
                .select('id, title, start_datetime, tickets_sold')
                .eq('organizer_id', pid)
                .gte('start_datetime', todayStart.toISOString())
                .order('start_datetime', { ascending: true })
                .limit(25)
            if (q.trim()) query = query.ilike('title', `%${q.trim()}%`)
            const { data } = await query
            setInsertResults(data || [])
        } catch (err) {
            console.error('Failed to search events:', err)
        } finally {
            setInsertLoading(false)
        }
    }

    // Load + debounce searches while the insert-event dialog is open.
    useEffect(() => {
        if (!insertEventOpen) return
        const t = setTimeout(() => searchInsertEvents(eventQuery), 250)
        return () => clearTimeout(t)
    }, [eventQuery, insertEventOpen])

    async function loadAudienceCount() {
        // Hand-picked lists carry their own exact count — no server lookup needed.
        if (audienceType === 'specific_customers') return
        setLoadingCount(true)
        try {
            const partnerId = await getPartnerId()
            if (!partnerId) return
            const count = await getAudienceCount(partnerId, audienceType, selectedEventId || undefined, selectedSegment || undefined)
            setAudienceCount(count)
        } catch (err) {
            console.error('Failed to load audience count:', err)
        } finally {
            setLoadingCount(false)
        }
    }

    // Send a one-off preview to the logged-in organizer. Goes straight to Resend
    // via the edge fn's test path — no campaign row, no stats, no history.
    const handleSendTest = async () => {
        if (!subject || !content) {
            toast({ title: 'Add a subject and content first', variant: 'destructive' })
            return
        }
        setSendingTest(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user?.email) throw new Error('Could not find your email address')

            let { data: partner } = await supabase
                .from('partners').select('id, business_name').eq('user_id', user.id).maybeSingle()
            if (!partner) {
                const { data: tm } = await supabase
                    .from('partner_team_members').select('partner_id').eq('user_id', user.id).maybeSingle()
                if (tm?.partner_id) {
                    const { data: p } = await supabase
                        .from('partners').select('id, business_name').eq('id', tm.partner_id).single()
                    partner = p
                }
            }
            if (!partner) throw new Error('Partner profile not found')

            const { data, error } = await supabase.functions.invoke('send-promotional-email', {
                body: {
                    partner_id: partner.id,
                    subject,
                    html_content: content,
                    sender_name: partner.business_name,
                    test_recipient: user.email,
                },
            })
            if (error) throw new Error(error.message || 'Failed to send test')
            if (!data?.success) throw new Error(data?.error || 'Test send failed')

            toast({ title: 'Test sent', description: `Check ${user.email} — it may take a moment to arrive.` })
        } catch (err: any) {
            toast({ title: 'Could not send test', description: err.message, variant: 'destructive' })
        } finally {
            setSendingTest(false)
        }
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
                description: "Please select which event to target.",
                variant: "destructive"
            })
            return
        }

        if (audienceType === 'customer_segment' && !selectedSegment) {
            toast({ title: 'Choose a segment', description: 'Please pick a customer segment to target.', variant: 'destructive' })
            return
        }

        if (audienceType === 'specific_customers' && specificRecipients.length === 0) {
            toast({ title: 'No customers selected', description: 'Pick customers from the Customers page first.', variant: 'destructive' })
            return
        }

        const selectedEventTitle = events.find(e => e.id === selectedEventId)?.title
        const audienceLabel = audienceType === 'all_subscribers'
            ? 'ALL active subscribers'
            : audienceType === 'event_attendees'
                ? `all attendees of "${selectedEventTitle}"`
                : audienceType === 'specific_customers'
                    ? `${specificRecipients.length} hand-picked customer${specificRecipients.length !== 1 ? 's' : ''}`
                    : `your "${segmentLabel(selectedSegment)}" segment`

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

            // If sending from a saved draft, reuse that row (no orphan draft left behind)
            if (draftId) body.draft_campaign_id = draftId

            if (audienceType === 'event_attendees' && selectedEventId) {
                // All buyers regardless of newsletter opt-in; names carried for {{first_name}}.
                const recipients = await getEventAttendeeRecipients(selectedEventId)
                if (recipients.length === 0) {
                    throw new Error("No attendee emails found for this event")
                }
                body.target_recipients = recipients
                body.segment = 'event_attendees'
                body.event_id = selectedEventId
            } else if (audienceType === 'customer_segment' && selectedSegment) {
                // Resolve the RFM/customer segment to named recipients; suppression is applied downstream.
                const recipients = await getSegmentRecipients(partner.id, selectedSegment)
                if (recipients.length === 0) {
                    throw new Error("No customers in this segment yet")
                }
                body.target_recipients = recipients
                body.segment = selectedSegment
            } else if (audienceType === 'specific_customers') {
                // Hand-picked list from the Customers page; suppression still applies downstream.
                if (specificRecipients.length === 0) throw new Error('No customers selected')
                body.target_recipients = specificRecipients
                body.segment = 'specific_customers'
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
            setSelectedSegment('')
            setSpecificRecipients([])
            setDraftId(null)
            refreshDrafts()

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
        <Card className="w-full overflow-hidden border-border/60 shadow-sm">
            <CardHeader className="border-b bg-gradient-to-r from-muted/40 to-transparent pb-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Send className="h-5 w-5" />
                    </div>
                    <div>
                        <CardTitle className="text-lg">Create a campaign</CardTitle>
                        <CardDescription>
                            Compose a beautiful email, pick your audience, and send or schedule it.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-6">
                <div className="space-y-6">
                    {/* Drafts */}
                    {drafts.length > 0 && (
                        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <FileText className="h-4 w-4 text-muted-foreground" /> Drafts
                            </div>
                            <div className="space-y-1.5">
                                {drafts.map(d => (
                                    <div key={d.id} className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm ${draftId === d.id ? 'bg-primary/10' : 'hover:bg-muted'}`}>
                                        <span className="truncate flex-1">
                                            {d.subject || '(no subject)'}
                                            <span className="text-xs text-muted-foreground ml-2">{format(new Date(d.updated_at), 'MMM d, h:mm a')}</span>
                                        </span>
                                        <Button variant="ghost" size="sm" onClick={() => handleResumeDraft(d.id)}>Resume</Button>
                                        <Button variant="ghost" size="sm" onClick={() => handleDeleteDraft(d.id)} className="text-muted-foreground hover:text-destructive">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Scheduled campaigns */}
                    {scheduled.length > 0 && (
                        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <CalendarClock className="h-4 w-4 text-muted-foreground" /> Scheduled
                            </div>
                            <div className="space-y-1.5">
                                {scheduled.map(s => (
                                    <div key={s.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                                        <span className="truncate flex-1">
                                            {s.subject || '(no subject)'}
                                            <span className="text-xs text-muted-foreground ml-2 inline-flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {format(new Date(s.scheduled_for), 'MMM d, h:mm a')}
                                            </span>
                                            {s.status === 'scheduled_failed' && (
                                                <Badge variant="destructive" className="ml-2 text-[10px] py-0">Failed</Badge>
                                            )}
                                        </span>
                                        <Button variant="ghost" size="sm" onClick={() => handleCancelScheduled(s.id)} className="text-muted-foreground hover:text-destructive">
                                            <X className="h-3.5 w-3.5 mr-1" /> Cancel
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Audience Selector */}
                    <div className="space-y-3">
                        <Label className="text-base font-semibold">Audience</Label>

                        {/* Hand-picked list (deep-linked from the Customers page) */}
                        {audienceType === 'specific_customers' && (
                            <div className="rounded-lg border-2 border-primary bg-primary/5 p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                    <UserCheck className="h-5 w-5 text-primary shrink-0" />
                                    <p className="font-medium text-sm">
                                        Sending to {specificRecipients.length} hand-picked customer{specificRecipients.length !== 1 ? 's' : ''}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {specificRecipients.slice(0, 10).map((r) => (
                                        <span key={r.email} className="text-xs bg-background border rounded-full px-2 py-0.5 text-muted-foreground">
                                            {r.first_name || r.email}
                                        </span>
                                    ))}
                                    {specificRecipients.length > 10 && (
                                        <span className="text-xs text-muted-foreground px-1 py-0.5">
                                            +{specificRecipients.length - 10} more
                                        </span>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setSpecificRecipients([]); setAudienceType('all_subscribers'); setAudienceCount(null) }}
                                    className="text-xs text-primary hover:underline"
                                >
                                    Choose a different audience instead
                                </button>
                            </div>
                        )}

                        {audienceType !== 'specific_customers' && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                                    <p className="text-xs text-muted-foreground">Everyone on your list</p>
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
                                    <p className="text-xs text-muted-foreground">Everyone who bought tickets</p>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setAudienceType('customer_segment')}
                                className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                                    audienceType === 'customer_segment'
                                        ? 'border-primary bg-primary/5 shadow-sm'
                                        : 'border-border hover:border-primary/40'
                                }`}
                            >
                                <Target className={`h-5 w-5 shrink-0 ${audienceType === 'customer_segment' ? 'text-primary' : 'text-muted-foreground'}`} />
                                <div>
                                    <p className="font-medium text-sm">Customer Segment</p>
                                    <p className="text-xs text-muted-foreground">By value or behavior</p>
                                </div>
                            </button>
                        </div>
                        )}

                        {/* Event Picker (shown when event-specific audience selected) */}
                        {audienceType === 'event_attendees' && (
                            <div className="space-y-2 animate-in fade-in-50 duration-300">
                                <Label htmlFor="event-select">Select Event</Label>
                                <EventCombobox
                                    events={events}
                                    value={selectedEventId}
                                    onChange={setSelectedEventId}
                                    loading={loadingEvents}
                                    attendeesOnly
                                />
                            </div>
                        )}

                        {/* Segment Picker (shown when customer-segment audience selected) */}
                        {audienceType === 'customer_segment' && (
                            <div className="space-y-2 animate-in fade-in-50 duration-300">
                                <Label>Choose a segment</Label>
                                <Select value={selectedSegment} onValueChange={setSelectedSegment}>
                                    <SelectTrigger><SelectValue placeholder="Select a customer segment…" /></SelectTrigger>
                                    <SelectContent>
                                        {SEGMENT_OPTIONS.map((o) => (
                                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    Emails everyone in this segment. Unsubscribes &amp; bounces are skipped automatically.
                                </p>
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
                                        all buyers from {selectedEvent.title}
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

                    {/* Compose toolbar */}
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-2">
                        <Button size="sm" onClick={() => setAiOpen(true)} className="gap-1.5 bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white hover:opacity-90">
                            <Sparkles className="h-4 w-4" /> Write with AI
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setTemplatesOpen(true)} className="gap-1.5 bg-background">
                            <LayoutTemplate className="h-4 w-4 text-primary" /> Templates
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setEventQuery(''); setInsertResults([]); setInsertEventOpen(true) }} className="gap-1.5 bg-background">
                            <CalendarPlus className="h-4 w-4 text-primary" /> Insert event
                        </Button>
                        <div className="flex-1" />
                        <Button variant="ghost" size="sm" onClick={handleSendTest} disabled={sendingTest || !subject || !content} className="gap-1.5">
                            {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Beaker className="h-4 w-4" />} Send test to me
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setSaveTplOpen(true)} disabled={!content.trim()} className="gap-1.5">
                            <Bookmark className="h-4 w-4" /> Save as template
                        </Button>
                    </div>

                    {/* Personalization hint */}
                    <p className="-mt-3 text-xs text-muted-foreground">
                        Personalize with <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{'{{first_name}}'}</code> and{' '}
                        <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{'{{business_name}}'}</code> — they fill in per recipient when the email goes out.
                    </p>

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
                                key={editorKey}
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
            <CardFooter className="flex-col gap-4 pt-2 pb-6 px-6">
                {/* Send later toggle + time picker */}
                <div className="w-full rounded-lg border bg-muted/20 p-3 space-y-3">
                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={scheduleMode}
                            onChange={(e) => {
                                setScheduleMode(e.target.checked)
                                if (e.target.checked && !scheduledFor) {
                                    setScheduledFor(toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)))
                                }
                            }}
                            className="h-4 w-4 rounded border-input accent-primary"
                        />
                        <CalendarClock className="h-4 w-4 text-muted-foreground" />
                        Send later
                    </label>
                    {scheduleMode && (
                        <div className="space-y-2 animate-in fade-in-50 duration-200">
                            <Input
                                type="datetime-local"
                                value={scheduledFor}
                                min={toLocalInputValue(new Date(Date.now() + 5 * 60 * 1000))}
                                onChange={(e) => setScheduledFor(e.target.value)}
                                className="w-full sm:w-auto"
                            />
                            {audienceType === 'event_attendees' && (
                                <p className="text-xs text-muted-foreground">
                                    Note: attendee recipients are locked in at schedule time — buyers who purchase after won&apos;t be included.
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <div className="w-full justify-between gap-3 flex flex-col sm:flex-row">
                    <Button
                        variant="outline"
                        onClick={handleSaveDraft}
                        disabled={savingDraft || sending || scheduling || (!subject && !content)}
                        className="w-full sm:w-auto"
                    >
                        {savingDraft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {draftId ? 'Update draft' : 'Save as draft'}
                    </Button>

                    {scheduleMode ? (
                        <Button
                            onClick={handleSchedule}
                            disabled={scheduling || !subject || !content || !scheduledFor || (audienceType === 'event_attendees' && !selectedEventId) || (audienceType === 'customer_segment' && !selectedSegment)}
                            size="lg"
                            className="w-full sm:w-auto"
                        >
                            {scheduling ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Scheduling...
                                </>
                            ) : (
                                <>
                                    <CalendarClock className="mr-2 h-4 w-4" />
                                    Schedule Campaign
                                </>
                            )}
                        </Button>
                    ) : (
                        <Button
                            onClick={handleSend}
                            disabled={sending || !subject || !content || (audienceType === 'event_attendees' && !selectedEventId) || (audienceType === 'customer_segment' && !selectedSegment)}
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
                    )}
                </div>
            </CardFooter>

            {/* Templates gallery */}
            <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader><DialogTitle>Start from a template</DialogTitle></DialogHeader>
                    <div className="grid sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto overscroll-contain pr-1">
                        {templates.length === 0 ? (
                            <p className="text-sm text-muted-foreground col-span-full py-6 text-center">No templates yet.</p>
                        ) : templates.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => applyTemplate(t)}
                                className="text-left rounded-xl border p-4 transition-all hover:border-primary/50 hover:shadow-sm"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <p className="font-semibold text-sm">{t.name}</p>
                                    {t.is_system ? (
                                        <Badge variant="secondary" className="text-[10px] shrink-0">Starter</Badge>
                                    ) : (
                                        <span
                                            role="button"
                                            tabIndex={0}
                                            onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(t.id) }}
                                            className="text-muted-foreground hover:text-destructive shrink-0"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </span>
                                    )}
                                </div>
                                {t.description && <p className="text-xs text-muted-foreground mt-1">{t.description}</p>}
                            </button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Insert event */}
            <Dialog open={insertEventOpen} onOpenChange={setInsertEventOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader><DialogTitle>Insert an event</DialogTitle></DialogHeader>
                    <p className="text-sm text-muted-foreground -mt-2">Adds a live event card with a Get&nbsp;Tickets button. Only upcoming events are shown.</p>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            autoFocus
                            placeholder="Search your upcoming events…"
                            value={eventQuery}
                            onChange={(e) => setEventQuery(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    <div className="max-h-[50vh] overflow-y-auto overscroll-contain">
                        {insertLoading ? (
                            <div className="flex items-center justify-center py-8 text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Searching…
                            </div>
                        ) : insertResults.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-8 text-center">
                                {eventQuery.trim() ? 'No upcoming events match your search.' : 'No upcoming events.'}
                            </p>
                        ) : insertResults.map((e) => (
                            <button
                                key={e.id}
                                type="button"
                                disabled={inserting}
                                onClick={() => insertEvent(e.id)}
                                className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-3 text-left hover:bg-muted/50 disabled:opacity-60"
                            >
                                <div className="min-w-0">
                                    <p className="font-medium text-sm truncate">{e.title}</p>
                                    <p className="text-xs text-muted-foreground">{formatInManila(e.start_datetime, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                </div>
                                {inserting ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <Plus className="h-4 w-4 text-primary shrink-0" />}
                            </button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Save as template */}
            <Dialog open={saveTplOpen} onOpenChange={setSaveTplOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Save as template</DialogTitle></DialogHeader>
                    <Input placeholder="Template name" value={tplName} onChange={(e) => setTplName(e.target.value)} />
                    <Button onClick={handleSaveAsTemplate} disabled={!content.trim()} className="gap-1.5">
                        <Bookmark className="h-4 w-4" /> Save template
                    </Button>
                </DialogContent>
            </Dialog>

            {/* Write with AI */}
            <Dialog open={aiOpen} onOpenChange={setAiOpen}>
                <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto overscroll-contain">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-fuchsia-500" /> Write with AI
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs">What's this email about?</Label>
                            <Textarea
                                value={aiBrief}
                                onChange={(e) => setAiBrief(e.target.value)}
                                placeholder="e.g. Announce our Friday jazz night, early-bird tickets end Sunday. Casual, hype vibe."
                                className="min-h-[90px]"
                            />
                        </div>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Tone</Label>
                                <Select value={aiTone} onValueChange={setAiTone}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Friendly & fun">Friendly &amp; fun</SelectItem>
                                        <SelectItem value="Hype & urgent">Hype &amp; urgent</SelectItem>
                                        <SelectItem value="Professional">Professional</SelectItem>
                                        <SelectItem value="Playful">Playful</SelectItem>
                                        <SelectItem value="Warm & personal">Warm &amp; personal</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">About an event (optional)</Label>
                                <Select value={aiEventId || 'none'} onValueChange={(v) => setAiEventId(v === 'none' ? '' : v)}>
                                    <SelectTrigger><SelectValue placeholder="No specific event" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No specific event</SelectItem>
                                        {events.map((e) => (
                                            <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <Button onClick={generateAiCopy} disabled={aiGenerating || !aiBrief.trim()} className="w-full gap-1.5">
                            {aiGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                            {aiGenerating ? 'Writing…' : aiResult ? 'Regenerate' : 'Generate'}
                        </Button>

                        {aiResult && (
                            <div className="space-y-3 rounded-lg border bg-muted/20 p-3 animate-in fade-in-50">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Pick a subject line</Label>
                                    <div className="space-y-1.5">
                                        {aiResult.subjects.map((s) => (
                                            <button
                                                key={s}
                                                type="button"
                                                onClick={() => setAiSubject(s)}
                                                className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${aiSubject === s ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}
                                            >
                                                <span className={`h-3.5 w-3.5 shrink-0 rounded-full border ${aiSubject === s ? 'border-primary bg-primary' : ''}`} />
                                                <span className="flex-1">{s}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Preview</Label>
                                    <div
                                        className="prose prose-sm max-w-none max-h-56 overflow-y-auto overscroll-contain rounded-md border bg-white p-4 text-gray-800"
                                        dangerouslySetInnerHTML={{ __html: aiResult.html }}
                                    />
                                </div>
                                <Button onClick={applyAiCopy} className="w-full gap-1.5">
                                    <Sparkles className="h-4 w-4" /> Use this copy
                                </Button>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </Card>
    )
}
