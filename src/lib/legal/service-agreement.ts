/**
 * Xendit sub-merchant Services Agreement (Xendit ↔ partner, HangHut = Platform
 * Account Holder). We run our own e-consent: the partner reviews the HangHut-filled
 * PDF, e-signs, and we append an Audit Trail page + submit it as SERVICE_AGREEMENT_DOCUMENT.
 *
 * Bump `version` whenever the template changes — forces partners to re-sign and keeps
 * the document_hash meaningful.
 */
export const SERVICE_AGREEMENT = {
    type: 'xendit_service_agreement' as const,
    version: 'v1-2026-07',

    // The blank HangHut-filled template the partner reviews + signs. Public bucket is
    // fine (it contains no partner data).
    templateBucket: 'XENDIT_AGREEMENT',
    templatePath: 'Xendit_Services_Agreement_HangHut_SubMerchant_Template (1).pdf',

    // Signed copies carry PII (signer name, email, IP) — they MUST live in the private
    // kyc-documents bucket (same bucket submit-xendit-kyc reads for the KYC doc set).
    signedBucket: 'kyc-documents',
} as const
