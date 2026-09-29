/**
 * Shapes and the audience catalogue for platform marketing.
 *
 * Kept OUT of marketing-actions.ts deliberately: that file is `'use server'`,
 * and such a module may only export async functions. A plain const array
 * exported from it builds and typechecks fine, then fails at module evaluation
 * with "A 'use server' file can only export async functions, found object".
 * Types alone would have been safe; PLATFORM_AUDIENCES is a runtime value, so
 * it lives here and both the server action and the client component import it.
 */

export type PlatformAudience =
    | 'all_buyers'
    | 'account_holders'
    | 'everyone'
    | 'event_buyers'
    | 'lapsed_buyers'
    | 'app_waitlist'

export interface AudienceOption {
    value: PlatformAudience
    label: string
    description: string
    /** Needs an event picked before it can resolve. */
    needsEvent?: boolean
    /** Needs a day count. */
    needsDays?: boolean
}

export interface PlatformRecipient {
    email: string
    first_name: string | null
}

export const PLATFORM_AUDIENCES: AudienceOption[] = [
    { value: 'all_buyers', label: 'Ticket buyers', description: 'Everyone who has completed a purchase on HangHut.' },
    { value: 'account_holders', label: 'Account holders', description: 'Everyone with a HangHut account, whether or not they have bought.' },
    { value: 'everyone', label: 'Everyone we know', description: 'Buyers and account holders combined, de-duplicated.' },
    { value: 'event_buyers', label: 'Buyers of one event', description: 'People who bought a ticket to a specific event.', needsEvent: true },
    { value: 'lapsed_buyers', label: 'Lapsed buyers', description: 'Bought before, but nothing recently.', needsDays: true },
    { value: 'app_waitlist', label: 'App waitlist', description: 'People waiting for the mobile app.' },
]
