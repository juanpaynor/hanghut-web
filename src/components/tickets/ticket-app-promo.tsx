import { ShieldCheck } from 'lucide-react'

// Store URLs duplicated from components/landing/store-buttons.tsx rather than
// importing it: that one is a client component (useId for its gradient ids,
// an onClick tap handler) styled for the dark landing page, and /t/[token] is
// deliberately static and light. Pulling it in would ship client JS to a page
// whose whole point is being cacheable.
const APP_STORE = 'https://apps.apple.com/ph/app/hanghut-social-hangouts/id6764278827'
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.hanghut.hanghut&pcampaignid=web_share'

/**
 * "Secure your tickets" — the app prompt on the hosted ticket page.
 *
 * WHY THE COPY IS SPECIFIC ABOUT THE EMAIL, instead of just "download the app":
 * get_user_tickets already matches guest purchases to an account by address --
 * `t.user_id = v_uid OR (t.user_id IS NULL AND lower(t.guest_email) = v_email)`
 * -- so an account made with the checkout email inherits every past guest
 * ticket with no claim step. 93% of sold tickets (5,552 of 5,990) are guest
 * purchases carrying an email, so this works for almost everyone. Saying only
 * "get the app" would bury the one instruction that makes it work.
 *
 * It needs a CONFIRMED address: get_user_tickets reads auth.users with
 * `email_confirmed_at IS NOT NULL`. All 908 accounts are confirmed today, so
 * this is not a caveat worth putting in front of a buyer.
 *
 * WHY THE APPLE LINE IS NOT PEDANTRY: 117 of 163 Apple accounts on prod (72%)
 * are @privaterelay.appleid.com, because "Hide My Email" mints a per-app alias.
 * That alias can never equal the address they typed at checkout, so those
 * buyers would install the app, sign in, and find an empty wallet with nothing
 * explaining why. One sentence up front is the whole fix; there is no
 * server-side one, since Apple will not reveal the real address.
 *
 * WHAT IS DELIBERATELY ABSENT: the buyer's own email. It would make the
 * instruction concrete, but get_ticket_order does not return it and must not --
 * this page is readable by anyone holding the token, so printing the address
 * would turn a shared ticket link into a disclosed email.
 */
export function TicketAppPromo({ accent }: { accent?: string | null }) {
    return (
        <div
            className="rounded-2xl border bg-background p-5"
            style={accent ? { borderColor: `${accent}40` } : undefined}
        >
            <div className="flex items-start gap-3">
                <div
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{ background: accent ? `${accent}18` : 'rgba(99,102,241,0.10)' }}
                >
                    <ShieldCheck className="h-4.5 w-4.5" style={accent ? { color: accent } : { color: '#4f46e5' }} />
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-semibold">Secure your tickets</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        This page is the only copy of your tickets. Get the HangHut app and sign up
                        with <strong className="font-medium text-foreground">the same email you used at checkout</strong> —
                        these tickets, and every one you buy later, appear automatically. Nothing to
                        enter, no link to keep.
                    </p>

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <a
                            href={APP_STORE}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex flex-1 items-center justify-center gap-2.5 rounded-xl bg-[#111] px-4 py-2.5 text-white transition-colors hover:bg-black"
                        >
                            <svg viewBox="0 0 814 1000" className="h-5 w-auto shrink-0" fill="currentColor" aria-hidden="true">
                                <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.5-155.5-118.3C46.2 736.3 0 627.3 0 522.5 0 339.1 116.3 242 230.4 242c61.3 0 112.2 40.8 150.1 40.8 36 0 92.8-43.1 164.8-43.1 26.5 0 108.2 2.6 159.2 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
                            </svg>
                            <span className="text-sm font-semibold">App Store</span>
                        </a>
                        <a
                            href={PLAY_STORE}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex flex-1 items-center justify-center gap-2.5 rounded-xl bg-[#111] px-4 py-2.5 text-white transition-colors hover:bg-black"
                        >
                            {/* Flat white glyph, not the four-gradient Play mark: the landing
                                version needs unique gradient ids per instance, which is exactly
                                the client-component dependency this file avoids. */}
                            <svg viewBox="0 0 512 512" className="h-5 w-auto shrink-0" fill="currentColor" aria-hidden="true">
                                <path d="M47 24c-5 5-8 13-8 23v418c0 10 3 18 8 23l236-232L47 24zm265 203L72 11l285 163-45 53zm0 58l45 53L72 501l240-216zm71-29l78-45c17-10 17-36 0-46l-78-45-52 68 52 68z" />
                            </svg>
                            <span className="text-sm font-semibold">Google Play</span>
                        </a>
                    </div>

                    {/* 72% of Apple sign-ins on prod use a privaterelay alias, which can
                        never match a checkout address. See the note above the component. */}
                    <p className="mt-3 text-xs text-muted-foreground">
                        Using <span className="font-medium">Sign in with Apple</span>? Choose{' '}
                        <span className="font-medium">Share My Email</span>. Hiding it creates a
                        different address, so we can&apos;t match these tickets to your account.
                    </p>
                </div>
            </div>
        </div>
    )
}
