'use client'

import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { formatInManila, isoToManilaLocal, manilaLocalToISO, PH_TIME_ZONE } from '@/lib/datetime'
import { setPresaleWindow } from '@/lib/organizer/presale-actions'
import { sendPresaleAnnouncementNow, type PresaleEmailCopy } from '@/lib/organizer/presale-announce-actions'
import { PresaleEmailEditor } from '@/components/organizer/presale-email-editor'
import { AlertTriangle, Users, Clock, Lock, Globe, Mail, Ticket } from 'lucide-react'

/**
 * The organizer's half of pre-registration.
 *
 * ⚠ The dates written here are NOT the gate. check_presale_access is, and it is
 * called by create-purchase-intent and /api/v1/checkouts. This panel only sets
 * what that function reads — which is the whole reason the SQL and the edge
 * function shipped before this screen existed. The platform already has one
 * sale window that lives only in the UI (subscriber_early_access_hours) and is
 * therefore bypassable by the app, the embed, the API and curl; there must not
 * be a second.
 */

interface Props {
    eventId: string
    presaleStartsAt: string | null
    publicSaleStartsAt: string | null
    registrationClosesAt: string | null
    /** How many people are already cleared to buy. */
    clearedCount: number
    /** Only ever non-zero when the event ALSO requires approval. */
    pendingCount: number
    /** Reserved seating — presale is refused on these for now. See the save action. */
    hasSeatMap: boolean
    /** When the on-sale announcement last went out, if ever. */
    notifiedAt: string | null
    /** {on_list, bought, tickets_left, capped} — did the presale work, and is
     *  there enough stock for the people waiting? */
    conversion: { on_list: number; bought: number; tickets_left: number; capped: boolean } | null
    /** The two emails, defaults already filled in. */
    emailCopy: { reminder: PresaleEmailCopy; announcement: PresaleEmailCopy; customised: boolean } | null
    /** Where "send me a test" goes. The signed-in organizer's own address. */
    testTo: string
}

export function PresaleManager({
    eventId,
    presaleStartsAt,
    publicSaleStartsAt,
    registrationClosesAt,
    clearedCount,
    pendingCount,
    hasSeatMap,
    notifiedAt,
    conversion,
    emailCopy,
    testTo,
}: Props) {
    const { toast } = useToast()
    const [saving, startSaving] = useTransition()

    const [presale, setPresale] = useState(isoToManilaLocal(presaleStartsAt))

    /**
     * ── WHY THE HEAD START IS A DURATION, NOT A SECOND DATE ─────────────────
     *
     * This asked for three separate datetimes and explained each in a
     * paragraph. Two of them only ever made sense RELATIVE to the first, so
     * the organizer was doing arithmetic in their head and could silently set
     * a public date before the presale even opened.
     *
     * "My list gets 48 hours first" is the thing they actually mean, it cannot
     * be ordered wrongly, and it still writes the same two timestamps the gate
     * reads — so nothing below the UI changed.
     */
    const hoursBetween = (a: string | null, b: string | null): number | null => {
        if (!a || !b) return null
        const d = (new Date(b).getTime() - new Date(a).getTime()) / 3600_000
        return Number.isFinite(d) && d > 0 ? Math.round(d) : null
    }
    const [headStart, setHeadStart] = useState<number | null>(
        hoursBetween(presaleStartsAt, publicSaleStartsAt))
    // "Everyone, after N hours" vs "my list only, forever".
    const [opensToAll, setOpensToAll] = useState<boolean>(publicSaleStartsAt !== null)
    // The list shuts the moment tickets open, rather than staying open to
    // latecomers who then buy immediately.
    const [closeWithPresale, setCloseWithPresale] = useState<boolean>(
        registrationClosesAt !== null)

    const on = presale !== ''
    // Belt and braces: the action refuses it server-side regardless.
    const locked = hasSeatMap

    /** The two derived timestamps, in the local format the action expects. */
    const derive = (p: string, all: boolean, hrs: number | null, closeIt: boolean) => {
        if (!p) return { publicAt: '', closesAt: '' }
        const base = new Date(manilaLocalToISO(p)).getTime()
        return {
            publicAt: all && hrs && hrs > 0
                ? isoToManilaLocal(new Date(base + hrs * 3600_000).toISOString())
                : '',
            closesAt: closeIt ? p : '',
        }
    }

    // What is actually in the database right now. Blur fires whether or not
    // anything changed, so without this, tabbing through the three fields
    // writes three times and fires three "Saved" toasts for doing nothing.
    const saved = useRef({
        presale: isoToManilaLocal(presaleStartsAt),
        publicAt: isoToManilaLocal(publicSaleStartsAt),
        closesAt: isoToManilaLocal(registrationClosesAt),
    })

    const save = (next?: Partial<{ presale: string; all: boolean; hrs: number | null; closeIt: boolean }>) => {
        const p = next?.presale ?? presale
        const all = next?.all ?? opensToAll
        const hrs = next?.hrs !== undefined ? next.hrs : headStart
        const closeIt = next?.closeIt ?? closeWithPresale
        const draft = { presale: p, ...derive(p, all, hrs, closeIt) }
        if (draft.presale === saved.current.presale
            && draft.publicAt === saved.current.publicAt
            && draft.closesAt === saved.current.closesAt) return

        const payload = {
            presaleStartsAt: manilaLocalToISO(draft.presale) || null,
            publicSaleStartsAt: manilaLocalToISO(draft.publicAt) || null,
            registrationClosesAt: manilaLocalToISO(draft.closesAt) || null,
        }
        startSaving(async () => {
            const res = await setPresaleWindow(eventId, payload)
            if (res.error) {
                toast({ title: 'Not saved', description: res.error, variant: 'destructive' })
                return
            }
            // Only once the server confirms. Updating this optimistically would
            // mean a refused date is remembered as saved, and the next blur
            // would skip retrying it.
            saved.current = draft
            toast({
                title: payload.presaleStartsAt ? 'Presale saved' : 'Presale turned off',
                // A warning is not a failure. Each one is something the
                // organizer may well have meant, so it is said plainly
                // alongside the success rather than instead of it.
                description: res.warning ?? (payload.presaleStartsAt
                    ? 'Buyers are gated from now on. Clearing the date undoes it instantly.'
                    : 'Anyone can buy again, as before.'),
                variant: res.warning ? 'destructive' : undefined,
            })
        })
    }

    const [announcing, startAnnouncing] = useTransition()
    const announce = () => {
        // A typed confirm, not a one-tap button. The exactly-once ledger is keyed
        // on campaign id, and a manual resend is a NEW campaign — so nothing in
        // the email machinery stops the same message reaching several hundred
        // people twice. The 10-minute cooldown on the server is the real guard;
        // this is so nobody trips it by accident in the first place.
        const n = clearedCount
        if (!window.confirm(
            `Email all ${n} pre-registered ${n === 1 ? 'person' : 'people'} that tickets are open?`
            + (notifiedAt ? '\n\nThey were already emailed once.' : '')
        )) return
        startAnnouncing(async () => {
            const res = await sendPresaleAnnouncementNow(eventId)
            toast(res.error
                ? { title: 'Not sent', description: res.error, variant: 'destructive' }
                : { title: 'Announcement sent', description: `On its way to your list.` })
        })
    }

    /**
     * Who can buy RIGHT NOW under a given configuration.
     *
     * This is the only question an organizer actually has at save time, and
     * three date controls never answered it. Shown before and after, side by
     * side, so "I just stopped everyone buying" cannot happen by accident.
     */
    const whoCanBuy = (p: string | null, all: boolean, hrs: number | null): string => {
        if (!p) return 'Anyone can buy — no presale'
        const open = new Date(manilaLocalToISO(p)).getTime()
        if (Number.isNaN(open)) return 'Anyone can buy — no presale'
        const now = Date.now()
        if (now < open) return 'NOBODY can buy yet'
        if (all && hrs && hrs > 0 && now >= open + hrs * 3600_000) return 'Anyone can buy'
        return 'Only your list can buy'
    }

    const savedNow = whoCanBuy(
        isoToManilaLocal(presaleStartsAt) || null,
        publicSaleStartsAt !== null,
        hoursBetween(presaleStartsAt, publicSaleStartsAt))
    const draftNow = whoCanBuy(presale || null, opensToAll, headStart)

    const dirty =
        presale !== (isoToManilaLocal(presaleStartsAt) || '')
        || opensToAll !== (publicSaleStartsAt !== null)
        || closeWithPresale !== (registrationClosesAt !== null)
        || (opensToAll && headStart !== hoursBetween(presaleStartsAt, publicSaleStartsAt))

    const [confirmOpen, setConfirmOpen] = useState(false)

    /**
     * The settings read back as one sentence.
     *
     * Three controls are each easy to set and together hard to picture — this
     * is the sentence the organizer was otherwise assembling in their head,
     * and it is where a wrong date shows itself before a buyer finds it.
     */
    const summary = (() => {
        if (!presale) return ''
        const when = new Date(manilaLocalToISO(presale))
        const fmt = (d: Date) => formatInManila(d.toISOString(), {
            weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
        })
        const openedAlready = when.getTime() <= Date.now()
        const head = `Your list ${openedAlready ? 'has been able to buy since' : 'can buy from'} ${fmt(when)}.`
        const pub = opensToAll && headStart && headStart > 0
            ? ` Everyone else ${headStart >= 24 ? `${Math.round(headStart / 24)} day(s)` : `${headStart} hour(s)`} later, on ${fmt(new Date(when.getTime() + headStart * 3600_000))}.`
            : ' Nobody else can buy at all.'
        const shut = closeWithPresale
            ? ' New pre-registrations stop at that same moment.'
            : ' People can keep joining the list after it opens.'
        return head + pub + shut
    })()

    // Also goes through the dialog. Turning it off is the SAFER direction — more
    // people can buy, not fewer — but it still cancels the scheduled emails,
    // and an organizer who clicked it by accident should find that out before
    // it happens rather than after.
    const turnOff = () => {
        setPresale('')
        setOpensToAll(false)
        setCloseWithPresale(false)
        setConfirmOpen(true)
    }

    return (
        <div className="rounded-xl border bg-card">
            <div className="p-5 border-b">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h4 className="font-semibold flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            Pre-registration
                        </h4>
                        <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                            Collect people before tickets sell, then let them buy first.
                            They answer your registration questions now and pay later.
                        </p>
                        {/* Said here rather than only in the save error. An
                            organizer who types two dates and is then refused has
                            already done the work; telling them first is cheaper
                            than telling them after. */}
                        {hasSeatMap && (
                            <p className="text-sm mt-2 max-w-xl flex items-start gap-1.5 text-amber-600 dark:text-amber-500">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <span>
                                    Not available on reserved-seating events yet. Someone who
                                    cannot buy could still hold seats during the presale and
                                    block the people who can.
                                </span>
                            </p>
                        )}
                    </div>
                    {on && (
                        <Button variant="ghost" size="sm" onClick={turnOff} disabled={saving}>
                            Turn off
                        </Button>
                    )}
                </div>
            </div>

            <div className="p-5 space-y-5">
                <div>
                    <Label htmlFor="presale_starts_at" className="flex items-center gap-1.5">
                        <Lock className="h-3.5 w-3.5" /> Tickets open to my list on
                    </Label>
                    <Input
                        id="presale_starts_at"
                        type="datetime-local"
                        value={presale}
                        onChange={(e) => setPresale(e.target.value)}
                        disabled={saving || locked}
                        className="max-w-xs"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Until then <strong>nobody</strong> can buy — not even you. Empty = no presale.
                    </p>
                </div>

                {/* Everything below only matters once there IS a presale, and
                    showing it beforehand is three controls asking about a thing
                    that does not exist yet. */}
                {on && (
                    <div className={cn('space-y-3', locked && 'opacity-50 pointer-events-none')}>
                        <Label className="flex items-center gap-1.5">
                            <Globe className="h-3.5 w-3.5" /> Then everyone else
                        </Label>
                        <div className="space-y-2">
                            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                                <input
                                    type="radio" name="presale-opens" checked={!opensToAll}
                                    onChange={() => setOpensToAll(false)}
                                    disabled={saving}
                                />
                                <span>Never — only my list can buy</span>
                            </label>
                            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                                <input
                                    type="radio" name="presale-opens" checked={opensToAll}
                                    onChange={() => {
                                        const h = headStart ?? 48
                                        setOpensToAll(true); setHeadStart(h)
                                    }}
                                    disabled={saving}
                                />
                                <span className="flex items-center gap-2">
                                    After
                                    <Input
                                        type="number" min={1} max={8760}
                                        value={headStart ?? 48}
                                        onChange={(e) => setHeadStart(Number(e.target.value) || null)}
                                        onFocus={() => setOpensToAll(true)}
                                        disabled={saving}
                                        className="w-20 h-8"
                                    />
                                    hours
                                </span>
                            </label>
                        </div>

                        <label className="flex items-start gap-2.5 text-sm cursor-pointer pt-1">
                            <input
                                type="checkbox" className="mt-0.5" checked={closeWithPresale}
                                onChange={(e) => setCloseWithPresale(e.target.checked)}
                                disabled={saving}
                            />
                            <span>
                                Close the list when tickets open
                                <span className="block text-xs text-muted-foreground">
                                    Otherwise someone can join a minute after you open and buy straight
                                    away. People already on the list keep their place either way.
                                </span>
                            </span>
                        </label>

                        {/* The whole configuration in one sentence. Two dates and a
                            duration are easy to set and hard to picture; this is
                            the sentence the organizer was assembling in their head. */}
                        <p className="text-sm rounded-lg bg-muted/50 px-3 py-2">
                            {summary}
                        </p>
                    </div>
                )}

                {/* ── NOTHING SAVES UNTIL THIS IS PRESSED ────────────────────
                    These fields used to write on blur. Autosave is right for a
                    draft and wrong for a switch that STOPS PEOPLE BUYING: a
                    mistyped year silently took an event off sale, and the
                    organizer's only clue was a toast that said "saved".
                    One button, one summary, one confirmation. */}
                {dirty && !locked && (
                    <div className="flex items-center gap-3 flex-wrap rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
                        <span className="text-sm">You have unsaved changes.</span>
                        <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={saving}>
                            Review and save
                        </Button>
                        <Button
                            size="sm" variant="ghost" disabled={saving}
                            onClick={() => {
                                setPresale(isoToManilaLocal(presaleStartsAt))
                                setOpensToAll(publicSaleStartsAt !== null)
                                setHeadStart(hoursBetween(presaleStartsAt, publicSaleStartsAt))
                                setCloseWithPresale(registrationClosesAt !== null)
                            }}
                        >
                            Discard
                        </Button>
                    </div>
                )}

                {on && emailCopy && (
                    <PresaleEmailEditor
                        eventId={eventId}
                        reminder={emailCopy.reminder}
                        announcement={emailCopy.announcement}
                        customised={emailCopy.customised}
                        testTo={testTo}
                    />
                )}

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 border-t text-sm">
                    <span className="flex items-center gap-1.5 pt-3">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <strong className="tabular-nums">{clearedCount}</strong>
                        <span className="text-muted-foreground">
                            {clearedCount === 1 ? 'person can buy' : 'people can buy'}
                        </span>
                    </span>
                    {pendingCount > 0 && (
                        <span className="flex items-center gap-1.5 pt-3 text-amber-600 dark:text-amber-500">
                            <AlertTriangle className="h-4 w-4" />
                            <strong className="tabular-nums">{pendingCount}</strong>
                            <span>
                                still waiting on your approval — they cannot buy until you review them
                            </span>
                        </span>
                    )}
                    {/* Did it work? Without this an organizer has no way to tell
                        whether a presale earned its complexity. Shown only once
                        somebody has bought, so a presale that has not opened yet
                        does not display a discouraging "0 of 412". */}
                    {conversion && conversion.bought > 0 && (
                        <span className="flex items-center gap-1.5 pt-3">
                            <Ticket className="h-4 w-4 text-muted-foreground" />
                            <strong className="tabular-nums">{conversion.bought}</strong>
                            <span className="text-muted-foreground">
                                of them bought
                                {conversion.on_list > 0 && ` (${Math.round(100 * conversion.bought / conversion.on_list)}%)`}
                            </span>
                        </span>
                    )}
                    {on && clearedCount > 0 && (
                        <Button
                            type="button" variant="outline" size="sm" className="mt-3"
                            onClick={announce} disabled={announcing || locked}
                        >
                            <Mail className="h-4 w-4 mr-1.5" />
                            {notifiedAt ? 'Send again' : 'Tell them now'}
                        </Button>
                    )}
                    <span className="pt-3 ml-auto text-xs text-muted-foreground">
                        Times are {PH_TIME_ZONE.replace('_', ' ')}
                    </span>
                </div>

                {/* Oversubscribed.
                    `capped` is separate from "0 left" on purpose: an event with
                    no quantity set has no shortage to warn about, and warning
                    there would train the organizer to ignore this line.
                    Found on sale day otherwise, from angry people. */}
                {on && conversion?.capped && conversion.on_list > conversion.tickets_left && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-500" />
                        <span>
                            <strong>{conversion.on_list}</strong> people are on the list and only{' '}
                            <strong>{conversion.tickets_left}</strong>{' '}
                            {conversion.tickets_left === 1 ? 'ticket is' : 'tickets are'} left.
                            Most of them will not get one — add stock, or expect complaints.
                        </span>
                    </div>
                )}
            </div>

            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{presale ? 'Save these presale settings?' : 'Turn the presale off?'}</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 text-sm">
                        {/* The only question that matters at save time, answered
                            as before → after rather than as three timestamps. */}
                        <div className="rounded-lg border divide-y">
                            <div className="flex items-center justify-between gap-3 px-3 py-2">
                                <span className="text-muted-foreground">Right now, today</span>
                                <span className="font-medium">{savedNow}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 px-3 py-2 bg-muted/40">
                                <span className="text-muted-foreground">After saving</span>
                                <span className="font-semibold">{draftNow}</span>
                            </div>
                        </div>

                        {summary && <p className="text-muted-foreground">{summary}</p>}

                        {/* Said BEFORE the click, not in a toast afterwards. */}
                        {draftNow !== savedNow && draftNow.startsWith('NOBODY') && (
                            <p className="flex items-start gap-2 text-amber-600 dark:text-amber-500">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <span>
                                    This takes the event off sale immediately. Nobody can buy —
                                    including people already on your list — until the date above.
                                </span>
                            </p>
                        )}
                        {draftNow !== savedNow && draftNow === 'Only your list can buy' && (
                            <p className="flex items-start gap-2 text-amber-600 dark:text-amber-500">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <span>
                                    From now on, anyone not on your list is refused at checkout.
                                    {clearedCount > 0 && ` ${clearedCount} can still buy.`}
                                </span>
                            </p>
                        )}
                        {notifiedAt && (
                            <p className="text-muted-foreground text-xs">
                                You have already emailed your list once. Changing the date now
                                means what they were told no longer matches — send again if it matters.
                            </p>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={saving}>
                            Cancel
                        </Button>
                        <Button onClick={() => { setConfirmOpen(false); save() }} disabled={saving}>
                            {presale ? 'Save settings' : 'Turn it off'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
