/**
 * Shared KYC vocabulary for Xendit `account_verification` (PH).
 *
 * Used by the organizer intake form, the submitKYCVerification server action,
 * and (mirrored) the submit-xendit-kyc edge function so all three agree on
 * entity types, business-profile enums, stakeholder roles, and document types.
 *
 * Enum *values* follow Xendit's documented constants where known; anything the
 * public docs don't pin down (basket size, sole-prop doc type) is marked and
 * will be confirmed against the Xendit sandbox during the dry-run.
 */

// ─── Entity types ─────────────────────────────────────────────────────────────
// NOTE: existing DB `business_type` uses 'sole_proprietorship'. We keep that
// value and add 'individual'. Corp/partnership require the stakeholders section.
export type EntityType =
    | 'individual'
    | 'sole_proprietorship'
    | 'corporation'
    | 'partnership'

export const ENTITY_TYPES: { value: EntityType; label: string }[] = [
    { value: 'individual', label: 'Individual' },
    { value: 'sole_proprietorship', label: 'Sole Proprietorship' },
    { value: 'corporation', label: 'Corporation' },
    { value: 'partnership', label: 'Partnership' },
]

/** Corp/partnership need the full business profile + stakeholders. */
export function requiresStakeholders(entity: string | null | undefined): boolean {
    return entity === 'corporation' || entity === 'partnership'
}

/** Individual / sole-prop are single-person: authorized = contact = the person. */
export function isSinglePerson(entity: string | null | undefined): boolean {
    return entity === 'individual' || entity === 'sole_proprietorship'
}

// ─── Business-profile enums (Xendit documented) ──────────────────────────────
export const BUSINESS_INTENTS = [
    { value: 'PAYMENTS', label: 'Accept payments' },
    { value: 'PAYOUT', label: 'Send payouts' },
    { value: 'GLOBAL_PAYOUT', label: 'Send global payouts' },
    { value: 'BUSINESS_EXPENSES', label: 'Business expenses' },
] as const

export const SOURCE_OF_FUNDS = [
    { value: 'REVENUE', label: 'Business revenue' },
    { value: 'INVESTOR_SHAREHOLDER_FUNDING', label: 'Investor / shareholder funding' },
    { value: 'INVESTMENT_INCOME', label: 'Investment income' },
    { value: 'BUSINESS_LOAN', label: 'Business loan' },
    { value: 'PERSONAL_FUNDING', label: 'Personal funding' },
    { value: 'DONATIONS', label: 'Donations' },
    { value: 'GRANTS', label: 'Grants' },
    { value: 'OTHER', label: 'Other' },
] as const

export const MONEY_OUT_FREQUENCY = [
    { value: 'DAILY', label: 'Daily' },
    { value: 'WEEKLY', label: 'Weekly' },
    { value: 'FORTNIGHTLY', label: 'Fortnightly' },
    { value: 'MONTHLY', label: 'Monthly' },
    { value: 'LESS_THAN_ONCE_A_MONTH', label: 'Less than once a month' },
] as const

// Basket-size ranges (PHP). Exact Xendit enum unconfirmed — sandbox dry-run will
// validate; values are stored/sent verbatim.
export const BASKET_SIZE = [
    { value: 'LESS_THAN_10000', label: 'Under ₱10,000' },
    { value: '10000_TO_50000', label: '₱10,000 – ₱50,000' },
    { value: '50000_TO_250000', label: '₱50,000 – ₱250,000' },
    { value: '250000_TO_1000000', label: '₱250,000 – ₱1,000,000' },
    { value: 'MORE_THAN_1000000', label: 'Over ₱1,000,000' },
] as const

export const GENDER = [
    { value: 'MALE', label: 'Male' },
    { value: 'FEMALE', label: 'Female' },
    { value: 'OTHER', label: 'Other' },
] as const

export const STAKEHOLDER_ROLES = [
    { value: 'BOARD_DIRECTOR', label: 'Board Director' },
    { value: 'BUSINESS_OWNER', label: 'Business Owner' },
    { value: 'LEGAL_PARTNER', label: 'Legal Partner' },
    { value: 'AUTHORIZED_SIGNATORY', label: 'Authorized Signatory' },
] as const

// PH identification document types (for authorized person + stakeholders).
export const ID_TYPES = [
    { value: 'PASSPORT', label: 'Passport' },
    { value: 'PHILSYS_ID', label: 'PhilSys / National ID' },
    { value: 'DRIVING_LICENSE', label: "Driver's License" },
    { value: 'UMID', label: 'UMID' },
    { value: 'SSS', label: 'SSS ID' },
    { value: 'POSTAL_ID', label: 'Postal ID' },
] as const

// ─── Document types (our internal vocabulary stored in partner_kyc_documents) ──
// owner_kind 'business' docs:
export const BUSINESS_DOC_TYPES = {
    GOVERNMENT_ID: 'GOVERNMENT_ID',                                  // legacy single ID column
    PH_DTI_CERTIFICATE_REGISTRATION: 'PH_DTI_CERTIFICATE_REGISTRATION', // sole prop (sandbox-confirm)
    PH_SEC_CERTIFICATE_REGISTRATION: 'PH_SEC_CERTIFICATE_REGISTRATION', // corp / partnership
    BUSINESS_REGISTRATION: 'BUSINESS_REGISTRATION',                  // legacy generic column
    PH_BIR_2303: 'PH_BIR_2303',
    PH_ARTICLES_OF_INCORPORATION: 'PH_ARTICLES_OF_INCORPORATION',    // corporation
    PH_NOTARIZED_SECRETARY_CERTIFICATE: 'PH_NOTARIZED_SECRETARY_CERTIFICATE', // corporation
    PH_GIS: 'PH_GIS',                                               // corporation
    PH_ARTICLES_OF_PARTNERSHIP: 'PH_ARTICLES_OF_PARTNERSHIP',        // partnership
    PH_NOTARIZED_PARTNER_CERTIFICATE: 'PH_NOTARIZED_PARTNER_CERTIFICATE', // partnership
    SERVICE_AGREEMENT: 'SERVICE_AGREEMENT',                          // all entities
    OFFICE_ADDRESS_PROOF: 'OFFICE_ADDRESS_PROOF',
} as const

// person-scoped docs (owner_kind 'authorized_person' | 'stakeholder'):
export const PERSON_DOC_TYPES = {
    ID_FRONT: 'ID_FRONT',
    ID_BACK: 'ID_BACK',
    SELFIE: 'SELFIE',
    PROOF_OF_RESIDENCY: 'PROOF_OF_RESIDENCY',
} as const

export type StructuredAddress = {
    street_line1?: string
    street_line2?: string
    city?: string
    province_state?: string
    postal_code?: string
    country?: string
}
