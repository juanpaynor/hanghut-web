'use client'

import { useEffect, useState } from 'react'
import { X, Award, Users, Compass } from 'lucide-react'
import { StoreButtons } from '@/components/landing/store-buttons'
import { trackEventInteraction } from '@/lib/analytics/track-event'

/**
 * Guest-checkout invitation to join HangHut.
 *
 * WHY IT POINTS AT THE APP AND NOT A WEB SIGNUP FORM: there is no consumer
 * signup on the web. /account/login has a "signup" tab whose entire body says
 * "Create your account on the HangHut app" — consumer accounts are only ever
 * created in Flutter. So the honest ask here is a download, not a form we do
 * not have.
 *
 * WHY IT NEVER BLOCKS: this sits below the guest details, above the pay button,
 * and takes nothing away if ignored. A buyer mid-payment is the worst possible
 * audience for an interruption, and a modal here would trade real ticket
 * revenue for speculative signups. It also says so out loud — "You don't need
 * an account to finish this purchase" — because a prompt that LOOKS like a
 * required step costs conversions whether or not it actually is one.
 *
 * Dismissal sticks per browser. Someone who said no once should not be asked
 * again every time they buy a ticket; that is how a soft prompt turns into the
 * thing people resent.
 *
 * Every claim below is a feature that exists today: 12 badges are defined and
 * 56 have been awarded, hangouts are the app's core surface, and /events is
 * live. Nothing here promises something we would have to build to honour.
 */

const DISMISS_KEY = 'hh_app_prompt_dismissed'

const BENEFITS = [
    { icon: Award, title: 'Collect badges', copy: 'Earn them for showing up' },
    { icon: Users, title: 'Find hangouts', copy: 'Small meetups near you' },
    { icon: Compass, title: 'Discover more', copy: 'Events like this one' },
]

export function JoinHangHutPrompt({ eventId }: { eventId: string }) {
    // Starts hidden and reveals after the storage read, so a dismissed prompt
    // never flashes on screen before disappearing.
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        let dismissed = false
        try {
            dismissed = localStorage.getItem(DISMISS_KEY) === '1'
        } catch {
            /* private mode / blocked storage: show it, worst case we ask twice */
        }
        if (!dismissed) {
            setVisible(true)
            // The denominator. Without a "shown" count, a tap count says
            // nothing about whether this works.
            trackEventInteraction(eventId, 'app_prompt_shown')
        }
    }, [eventId])

    function dismiss() {
        setVisible(false)
        try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* nothing to do */ }
    }

    if (!visible) return null

    return (
        <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-primary/[0.03] to-transparent p-5">
            <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss"
                className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-background/60 hover:text-foreground"
            >
                <X className="h-4 w-4" />
            </button>

            <div className="pr-8">
                <h3 className="text-base font-semibold tracking-tight">
                    The rest of HangHut lives in the app
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                    Free to join. You don&apos;t need an account to finish this purchase.
                </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {BENEFITS.map(({ icon: Icon, title, copy }) => (
                    <div key={title} className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            <Icon className="h-4 w-4 text-primary" />
                        </span>
                        <div className="min-w-0">
                            <p className="text-sm font-medium leading-tight">{title}</p>
                            <p className="text-xs text-muted-foreground">{copy}</p>
                        </div>
                    </div>
                ))}
            </div>

            <StoreButtons
                variant="dark"
                className="mt-4 !items-stretch sm:!items-center"
                onTap={() => trackEventInteraction(eventId, 'app_prompt_tap')}
            />
        </div>
    )
}
