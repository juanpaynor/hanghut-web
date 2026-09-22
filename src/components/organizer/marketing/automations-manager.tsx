'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Zap, Mail, TrendingUp } from 'lucide-react'
import { AutomationCard } from './automation-card'
import { META, ORDER, formatPeso } from './automation-meta'
import {
    getAutomations, upsertAutomation, toggleAutomation,
    getAutomationPerformance, getPartnerContext,
    type Automation, type AutomationTrigger, type AutomationStats,
} from '@/lib/marketing/automation-actions'

/**
 * Automations tab.
 *
 * Ordered by state, not by a fixed list: what is running sits at the top with
 * its numbers, what is dormant sits below. The old version rendered all six
 * identically, so an automation that had been sending for a week looked exactly
 * like one that had never been touched.
 */
export function AutomationsManager() {
    const { toast } = useToast()
    const [items, setItems] = useState<Record<string, Automation>>({})
    const [stats, setStats] = useState<Record<string, AutomationStats>>({})
    const [businessName, setBusinessName] = useState('')
    const [loading, setLoading] = useState(true)
    const [savingType, setSavingType] = useState<AutomationTrigger | null>(null)

    const load = useCallback(async () => {
        const [list, perf, ctx] = await Promise.all([
            getAutomations(),
            getAutomationPerformance(),
            getPartnerContext(),
        ])
        const map: Record<string, Automation> = {}
        for (const a of list) map[a.trigger_type] = a
        setItems(map)
        setStats(perf)
        setBusinessName(ctx?.business_name || '')
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])

    function patch(type: AutomationTrigger, p: Partial<Automation>) {
        setItems(prev => ({ ...prev, [type]: { ...prev[type], ...p } }))
    }

    async function save(type: AutomationTrigger) {
        const a = items[type]
        setSavingType(type)
        const res = await upsertAutomation({
            trigger_type: type,
            enabled: a.enabled,
            // upsertAutomation takes strings and normalises '' back to null.
            subject: a.subject ?? '',
            html_content: a.html_content ?? '',
            offset_minutes: a.offset_minutes ?? null,
        })
        setSavingType(null)
        if (res?.error) {
            toast({ title: 'Could not save', description: res.error, variant: 'destructive' })
            return
        }
        toast({ title: 'Saved' })
    }

    async function onToggle(type: AutomationTrigger, enabled: boolean) {
        // Optimistic — a switch that waits on a round-trip feels broken.
        patch(type, { enabled })
        const res = await toggleAutomation(type, enabled)
        if (res?.error) {
            patch(type, { enabled: !enabled })
            toast({ title: 'Could not update', description: res.error, variant: 'destructive' })
            return
        }
        if (enabled) {
            const a = items[type]
            // Turning on an empty automation sends nothing; say so now rather
            // than leaving them to discover it in a week of silence.
            if (!a?.subject || !a?.html_content) {
                toast({
                    title: 'On — but it needs content',
                    description: 'Add a subject and message, or write it with AI.',
                })
                return
            }
        }
        toast({ title: enabled ? 'Automation on' : 'Automation off' })
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading automations…
            </div>
        )
    }

    const live = ORDER.filter(t => items[t]?.enabled)
    const off = ORDER.filter(t => !items[t]?.enabled)

    const totals = Object.values(stats).reduce(
        (acc, s) => ({
            sent: acc.sent + (s.sent || 0),
            orders: acc.orders + (s.orders || 0),
            revenue: acc.revenue + (Number(s.revenue) || 0),
        }),
        { sent: 0, orders: 0, revenue: 0 },
    )

    return (
        <div className="space-y-6">
            {/* Summary — only once there is something true to say. */}
            {totals.sent > 0 && (
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { icon: Mail, label: 'sent automatically', value: totals.sent.toLocaleString() },
                        { icon: Zap, label: totals.orders === 1 ? 'order from them' : 'orders from them', value: String(totals.orders) },
                        { icon: TrendingUp, label: 'revenue credited', value: formatPeso(totals.revenue) },
                    ].map(({ icon: Icon, label, value }) => (
                        <div key={label} className="rounded-xl border bg-card px-4 py-3">
                            <Icon className="h-4 w-4 text-muted-foreground mb-1.5" />
                            <div className="text-xl font-bold tabular-nums leading-none">{value}</div>
                            <div className="text-[11px] text-muted-foreground mt-1">{label}</div>
                        </div>
                    ))}
                </div>
            )}

            {live.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-sm font-semibold">Running</h3>
                        <span className="text-xs text-muted-foreground">
                            {live.length} {live.length === 1 ? 'automation is' : 'automations are'} sending on their own
                        </span>
                    </div>
                    {live.map(type => (
                        <AutomationCard
                            key={type}
                            type={type}
                            meta={META[type]}
                            value={items[type]}
                            stats={stats[type]}
                            businessName={businessName}
                            saving={savingType === type}
                            onPatch={(p) => patch(type, p)}
                            onSave={() => save(type)}
                            onToggle={(v) => onToggle(type, v)}
                        />
                    ))}
                </div>
            )}

            <div className="space-y-3">
                <div className="flex items-baseline gap-2">
                    <h3 className="text-sm font-semibold">
                        {live.length > 0 ? 'Not running yet' : 'Automations'}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                        Write one, switch it on, and it sends without you.
                    </span>
                </div>
                {off.map(type => (
                    <AutomationCard
                        key={type}
                        type={type}
                        meta={META[type]}
                        value={items[type]}
                        stats={stats[type]}
                        businessName={businessName}
                        saving={savingType === type}
                        onPatch={(p) => patch(type, p)}
                        onSave={() => save(type)}
                        onToggle={(v) => onToggle(type, v)}
                    />
                ))}
            </div>

            <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={load} className="text-xs text-muted-foreground">
                    Refresh numbers
                </Button>
            </div>
        </div>
    )
}
