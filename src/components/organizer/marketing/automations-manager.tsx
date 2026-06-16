'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Save, UserPlus, CalendarClock, PartyPopper, Megaphone } from 'lucide-react'
import { RichTextEditor } from './rich-text-editor'
import {
    getAutomations, upsertAutomation, toggleAutomation,
    type Automation, type AutomationTrigger,
} from '@/lib/marketing/automation-actions'

const META: Record<AutomationTrigger, {
    title: string; description: string; icon: any; timing?: 'before' | 'after'; tokens: string[]
}> = {
    welcome: {
        title: 'Welcome email', icon: UserPlus,
        description: 'Sent automatically when someone subscribes to your list.',
        tokens: ['{{first_name}}', '{{business_name}}'],
    },
    pre_event: {
        title: 'Pre-event reminder', icon: CalendarClock, timing: 'before',
        description: "Your own reminder sent before an event starts, to that event's attendees.",
        tokens: ['{{first_name}}', '{{event_title}}', '{{event_date}}', '{{business_name}}'],
    },
    post_event: {
        title: 'Post-event thank-you', icon: PartyPopper, timing: 'after',
        description: "Sent after an event ends, to that event's attendees.",
        tokens: ['{{first_name}}', '{{event_title}}', '{{event_date}}', '{{business_name}}'],
    },
    new_event: {
        title: 'New event announcement', icon: Megaphone,
        description: 'Sent to all your subscribers when you publish a new event.',
        tokens: ['{{first_name}}', '{{event_title}}', '{{event_date}}', '{{business_name}}'],
    },
}

const ORDER: AutomationTrigger[] = ['welcome', 'pre_event', 'post_event', 'new_event']

export function AutomationsManager() {
    const [items, setItems] = useState<Record<string, Automation>>({})
    const [loading, setLoading] = useState(true)
    const [savingType, setSavingType] = useState<string | null>(null)
    const { toast } = useToast()

    useEffect(() => { load() }, [])

    async function load() {
        setLoading(true)
        const data = await getAutomations()
        const map: Record<string, Automation> = {}
        for (const a of data) map[a.trigger_type] = a
        setItems(map)
        setLoading(false)
    }

    function patch(type: AutomationTrigger, p: Partial<Automation>) {
        setItems(prev => ({ ...prev, [type]: { ...prev[type], ...p } }))
    }

    async function save(type: AutomationTrigger) {
        const a = items[type]
        setSavingType(type)
        const res = await upsertAutomation({
            trigger_type: type,
            subject: a.subject || '',
            html_content: a.html_content || '',
            offset_minutes: a.offset_minutes ?? null,
            enabled: a.enabled,
        })
        setSavingType(null)
        if (res.error) toast({ title: 'Could not save', description: res.error, variant: 'destructive' })
        else toast({ title: 'Saved', description: `${META[type].title} updated.` })
    }

    async function onToggle(type: AutomationTrigger, enabled: boolean) {
        // Optimistic; revert on failure.
        patch(type, { enabled })
        const res = await toggleAutomation(type, enabled)
        if (res.error) {
            patch(type, { enabled: !enabled })
            toast({ title: 'Could not enable', description: res.error, variant: 'destructive' })
        }
    }

    if (loading) {
        return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading automations…</div>
    }

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Automations send on their own based on what your subscribers and attendees do — no manual blast needed.
                Use the tokens shown on each card to personalize.
            </p>
            {ORDER.map(type => {
                const meta = META[type]
                const a = items[type]
                const Icon = meta.icon
                const hours = a.offset_minutes != null ? Math.round((a.offset_minutes / 60) * 10) / 10 : ''
                return (
                    <Card key={type}>
                        <CardHeader>
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3">
                                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                        <Icon className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            {meta.title}
                                            {a.enabled && <Badge className="bg-green-100 text-green-800 hover:bg-green-100">On</Badge>}
                                        </CardTitle>
                                        <CardDescription>{meta.description}</CardDescription>
                                    </div>
                                </div>
                                <Switch checked={a.enabled} onCheckedChange={(v) => onToggle(type, v)} />
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {meta.timing && (
                                <div className="flex items-end gap-2">
                                    <div className="space-y-1">
                                        <Label className="text-xs">Hours {meta.timing} the event</Label>
                                        <Input
                                            type="number" min={0} step={0.5} className="w-32"
                                            value={hours}
                                            onChange={(e) => patch(type, { offset_minutes: e.target.value === '' ? null : Math.round(parseFloat(e.target.value) * 60) })}
                                        />
                                    </div>
                                    <span className="text-xs text-muted-foreground pb-2.5">
                                        e.g. 24 = one day {meta.timing}
                                    </span>
                                </div>
                            )}
                            <div className="space-y-1">
                                <Label className="text-xs">Subject</Label>
                                <Input
                                    value={a.subject || ''}
                                    onChange={(e) => patch(type, { subject: e.target.value })}
                                    placeholder={type === 'welcome' ? 'Welcome to {{business_name}}!' : 'See you at {{event_title}}'}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Message</Label>
                                <RichTextEditor
                                    value={a.html_content || ''}
                                    onChange={(v) => patch(type, { html_content: v })}
                                    disabled={savingType === type}
                                />
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">Tokens:</span>
                                {meta.tokens.map(t => (
                                    <code key={t} className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{t}</code>
                                ))}
                            </div>
                            <div className="flex justify-end">
                                <Button onClick={() => save(type)} disabled={savingType === type} size="sm">
                                    {savingType === type ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                                    Save
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )
            })}
        </div>
    )
}
