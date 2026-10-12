'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { SessionsEditor } from '@/components/organizer/experiences/sessions-editor'
import {
    blankRule,
    estimateSlotCount,
    sessionConflicts,
    type AvailabilityRule,
    type RuleInput,
} from '@/lib/organizer/experience-availability'
import {
    saveAvailabilityRule,
    deactivateAvailabilityRule,
} from '@/lib/organizer/experience-availability-actions'
import { Loader2, CalendarClock, AlertTriangle } from 'lucide-react'

/**
 * Sessions on an EXISTING experience.
 *
 * Until this existed, availability rules could only be created in the wizard,
 * so a listing published before it — Pickle Project, BUSINESS MIXER, Let's Brew
 * it cafe x Pottery, all live and all with zero dates ever — had no way to get
 * one. Those three were invisible to buyers from the moment they were created.
 *
 * Saves each session, then lets the generator reconcile. A rule the host
 * removed is DEACTIVATED rather than deleted: deactivating lets the pruner
 * clear its future unbooked slots, while deleting the row would set
 * experience_schedules.generated_from_rule_id to NULL and strand them as
 * un-prunable manual slots.
 */
export function SessionsPanel({
    experienceId,
    initialRules,
    upcomingSlots,
    defaultMaxGuests,
}: {
    experienceId: string
    initialRules: AvailabilityRule[]
    upcomingSlots: number
    defaultMaxGuests?: number
}) {
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()

    const toInput = (r: AvailabilityRule): RuleInput => ({
        byweekday: r.byweekday ?? [],
        start_time_local: (r.start_time_local ?? '14:00').slice(0, 5),
        duration_minutes: r.duration_minutes,
        starts_on: r.starts_on,
        ends_on: r.ends_on,
        max_guests: r.max_guests,
        price_per_person: r.price_per_person,
        booking_cutoff_minutes: r.booking_cutoff_minutes ?? 0,
    })

    const active = initialRules.filter(r => r.is_active)
    const [sessions, setSessions] = useState<RuleInput[]>(
        active.length ? active.map(toInput) : [blankRule('14:00', defaultMaxGuests ?? 0)],
    )

    const total = sessions.reduce((n, r) => n + estimateSlotCount(r), 0)
    const issue = sessionConflicts(sessions).find(Boolean) ?? null

    const save = () => {
        if (sessions.some(r => !r.byweekday.length)) {
            toast({ title: 'Pick the days each session runs on', variant: 'destructive' }); return
        }
        if (sessions.some(r => !(r.max_guests > 0))) {
            toast({ title: 'Set how many guests fit in each session', variant: 'destructive' }); return
        }
        if (issue) { toast({ title: 'Two sessions clash', description: issue, variant: 'destructive' }); return }
        if (total < 1) {
            toast({ title: 'That pattern produces no dates', variant: 'destructive' }); return
        }

        startTransition(async () => {
            let created = 0

            // Rules are matched to editor rows by POSITION, which is how the
            // editor presents them. A row that no longer exists is deactivated
            // so the pruner can clear its unbooked future slots.
            for (let i = 0; i < sessions.length; i++) {
                const existing = active[i]
                const res = await saveAvailabilityRule(experienceId, sessions[i], existing?.id)
                if ('error' in res && res.error) {
                    toast({ title: 'Could not save', description: res.error, variant: 'destructive' })
                    return
                }
                created += ('generated' in res ? res.generated?.created : 0) ?? 0
            }

            for (let i = sessions.length; i < active.length; i++) {
                const res = await deactivateAvailabilityRule(active[i].id, experienceId)
                if ('error' in res && res.error) {
                    toast({ title: 'Could not remove a session', description: res.error, variant: 'destructive' })
                    return
                }
            }

            toast({
                title: 'Sessions saved',
                description: created > 0
                    ? `${created} new bookable ${created === 1 ? 'date' : 'dates'} added.`
                    : 'Your calendar is already up to date.',
            })
        })
    }

    return (
        <div className="space-y-5">
            <div className="flex items-start gap-3">
                <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                    <h2 className="text-xl font-semibold">Sessions</h2>
                    <p className="text-sm text-muted-foreground">
                        Each session is a time you run this, with its own price, capacity
                        and booking cutoff. We keep the calendar filled 90 days ahead.
                    </p>
                </div>
            </div>

            {/* The state that made this panel necessary: live, published, and
                unbookable because no date was ever created. Stated plainly
                rather than left for the host to infer from an empty calendar. */}
            {upcomingSlots === 0 && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="text-sm">
                        <p className="font-semibold text-amber-900 dark:text-amber-200">
                            This experience has no bookable dates
                        </p>
                        <p className="mt-0.5 text-amber-800/90 dark:text-amber-300/90">
                            It is hidden from guests until at least one upcoming date exists.
                            Set a session below and it goes live immediately.
                        </p>
                    </div>
                </div>
            )}

            <SessionsEditor
                value={sessions}
                onChange={setSessions}
                defaultMaxGuests={defaultMaxGuests}
            />

            <div className="flex items-center gap-3 border-t pt-4">
                <Button onClick={save} disabled={isPending}>
                    {isPending
                        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
                        : 'Save sessions'}
                </Button>
                <p className="text-xs text-muted-foreground">
                    {total > 0
                        ? `${total} bookable ${total === 1 ? 'date' : 'dates'} in the next 90 days.`
                        : 'No dates yet — pick the days above.'}
                </p>
            </div>
        </div>
    )
}
