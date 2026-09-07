/**
 * Badge vocabulary shared by the server actions and the builder UI.
 *
 * Deliberately NOT in badge-actions.ts: that file carries 'use server', and a
 * server-action module may only export async functions. A plain constant there
 * builds locally and then fails the production build with
 * "A 'use server' file can only export async functions, found object".
 */

/** RFM segments, identical to the ones on the Customers page. */
export const CUSTOMER_SEGMENTS = [
    { value: 'champion', label: 'Champions', hint: '3+ events, active in the last 90 days' },
    { value: 'loyal',    label: 'Loyal',     hint: 'Bought for 2+ of your events' },
    { value: 'active',   label: 'Active',    hint: 'Bought, and still engaged' },
    { value: 'new',      label: 'New',       hint: 'First seen in the last 45 days' },
    { value: 'at_risk',  label: 'At risk',   hint: 'Quiet for 120+ days' },
    { value: 'lost',     label: 'Lost',      hint: 'Quiet for 240+ days' },
] as const
