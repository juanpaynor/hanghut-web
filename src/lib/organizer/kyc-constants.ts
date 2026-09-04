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
/**
 * PH identification types offered in the form.
 *
 * `carriesAddress` drives a hard requirement, not a hint: Xendit requires
 * `proof_of_residency_document` whenever the submitted ID does not itself show a
 * residential address — a passport being the case they name explicitly. Getting
 * this wrong is silent: the submission is accepted and then rejected days later.
 *
 * `xendit` is the enum sent to the API. PhilSys splits physical/digital there,
 * so the form has to ask which one rather than collapsing both to one option.
 */
export const ID_TYPES = [
    { value: 'PHILSYS_PHYSICAL', label: 'PhilSys / National ID (physical card)', xendit: 'PH_PHILSYS_PHYSICAL', carriesAddress: true },
    { value: 'PHILSYS_DIGITAL',  label: 'PhilSys / National ID (digital)',       xendit: 'PH_PHILSYS_DIGITAL',  carriesAddress: true },
    { value: 'DRIVING_LICENSE',  label: "Driver's License",                      xendit: 'PH_DRIVERS_LICENSE',  carriesAddress: true },
    { value: 'UMID',             label: 'UMID',                                  xendit: 'PH_UMID',             carriesAddress: true },
    { value: 'SSS',              label: 'SSS / GSIS ID',                         xendit: 'PH_SSS_OR_GSIS',      carriesAddress: true },
    { value: 'PRC',              label: 'PRC ID',                                xendit: 'PH_PRC_LICENSE',      carriesAddress: true },
    { value: 'POSTAL_ID',        label: 'Postal ID',                             xendit: 'PH_POSTAL_ID',        carriesAddress: true },
    { value: 'VOTER_ID',         label: "Voter's ID",                            xendit: 'PH_VOTER_ID',         carriesAddress: true },
    { value: 'ACR',              label: 'ACR / Immigrant COR',                   xendit: 'PH_ACR_OR_IMMIGRANT_COR', carriesAddress: true },
    // Accepted, but a passport shows no address — selecting it forces an extra
    // proof-of-residency upload. Listed last so it isn't the path of least effort.
    { value: 'PASSPORT',         label: 'Passport (needs proof of address)',     xendit: 'PASSPORT',            carriesAddress: false },
] as const

/** True when choosing this ID also obliges a separate proof-of-residency document. */
export function idNeedsProofOfResidency(idType: string | null | undefined): boolean {
    const found = ID_TYPES.find(t => t.value === idType)
    // Unknown/unset is treated as needing proof: over-collecting costs an upload,
    // under-collecting costs a rejection cycle measured in days.
    return found ? !found.carriesAddress : true
}

/** Our internal ID value -> the enum Xendit expects. */
export function toXenditIdType(idType: string | null | undefined): string | null {
    return ID_TYPES.find(t => t.value === idType)?.xendit ?? null
}

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
    // "Use case and payment flow" — Xendit asks for this as BUSINESS_PROOF_DOCUMENT
    // and bounces submissions that omit it. Applies to EVERY entity type: it is not
    // a registration record, it is evidence that the business actually trades and
    // that money moves the way the application claims it does.
    BUSINESS_PROOF: 'BUSINESS_PROOF',
    OFFICE_ADDRESS_PROOF: 'OFFICE_ADDRESS_PROOF',
    // business_license_documents — Required for PH. Xendit PH support confirmed
    // the Mayor's Permit is what satisfies it for a Philippine corporation.
    PH_MAYORS_PERMIT: 'PH_MAYORS_PERMIT',
    // Required only when shareholders_include_corporate_entity is true.
    SHAREHOLDING_CHART: 'SHAREHOLDING_CHART',
} as const

// person-scoped docs (owner_kind 'authorized_person' | 'stakeholder'):
export const PERSON_DOC_TYPES = {
    ID_FRONT: 'ID_FRONT',
    ID_BACK: 'ID_BACK',
    SELFIE: 'SELFIE',
    PROOF_OF_RESIDENCY: 'PROOF_OF_RESIDENCY',
} as const

/**
 * Maps our stored address onto Xendit's `AccountVerificationAddress`.
 *
 * Two mismatches, both silent if unhandled:
 *  - the API field is `street_line_1` (underscore before the digit); ours is `street_line1`
 *  - the Philippines requires BOTH `province` and `state`, while we only ever
 *    captured one combined `province_state` box. We send the same value to both
 *    rather than leaving one empty, because "Metro Manila" is the true answer to
 *    each and a missing required field fails the whole submission.
 */
export function toXenditAddress(a: StructuredAddress | null | undefined) {
    if (!a) return null
    const region = a.province_state || ''
    return {
        street_line_1: a.street_line1 || '',
        ...(a.street_line2 ? { street_line_2: a.street_line2 } : {}),
        city: a.city || '',
        province: region,
        state: region,
        postal_code: a.postal_code || '',
        country_code: a.country || 'PH',
    }
}

/** Every field Xendit requires on a PH address. Used to block submit, not warn. */
export function missingAddressFields(a: StructuredAddress | null | undefined): string[] {
    const mapped = toXenditAddress(a)
    if (!mapped) return ['street_line_1', 'city', 'province', 'state', 'postal_code']
    return (['street_line_1', 'city', 'province', 'state', 'postal_code'] as const)
        .filter(k => !String((mapped as Record<string, unknown>)[k] ?? '').trim())
}

/**
 * Xendit wants `business_average_monthly_basket_size` as a USD range STRING
 * ("$50K - $300K"). Our form has always asked in PESOS, so this is a currency
 * conversion, not a relabel — and at ~₱56/$ every PH band below the top one
 * lands under $10K.
 *
 * Only the two values Xendit have confirmed in writing are mapped. The rest
 * deliberately return null so `submitKYCVerification` refuses to submit rather
 * than inventing an enum: an invalid value here fails the whole request with
 * INVALID_DATA_SUBMITTED, and a wrong-but-valid one misstates the merchant's
 * turnover to a compliance team.
 *
 * TODO(xendit): Laura @ Xendit PH — awaiting the full enum list, in particular
 * the band below $10K, which is where most PH partners will sit.
 */
const CONFIRMED_BASKET_SIZES: Record<string, string> = {
    // Intentionally empty. Xendit confirmed the FORMAT ("$50K - $300K") but not
    // which band each of our peso ranges maps to, and the two do not line up:
    // ₱250,000–₱1,000,000/month is roughly $4.5K–$18K, straddling their $10K
    // boundary rather than sitting inside a band. Guessing here is how the last
    // submission failed, so we return null and block instead.
}

export function toXenditBasketSize(phpBand: string | null | undefined): string | null {
    if (!phpBand) return null
    return CONFIRMED_BASKET_SIZES[phpBand] ?? null
}

export type StructuredAddress = {
    street_line1?: string
    street_line2?: string
    city?: string
    province_state?: string
    postal_code?: string
    country?: string
}
