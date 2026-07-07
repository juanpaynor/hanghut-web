'use server'

import { createClient as createAdmin } from '@supabase/supabase-js'
import { getAuthUser, getPartnerId } from '@/lib/auth/cached'
import { headers } from 'next/headers'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { createHash, randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { SERVICE_AGREEMENT } from '@/lib/legal/service-agreement'

function admin() {
    return createAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    )
}

export interface AgreementStatus {
    signed: boolean
    signed_at: string | null
    signer_name: string | null
    version: string | null
    current: boolean // signed the CURRENT version
}

/** Has this partner already e-signed the current Service Agreement? */
export async function getServiceAgreementStatus(): Promise<AgreementStatus> {
    const none = { signed: false, signed_at: null, signer_name: null, version: null, current: false }
    const { user } = await getAuthUser()
    if (!user) return none
    const partnerId = await getPartnerId(user.id)
    if (!partnerId) return none

    const { data } = await admin()
        .from('partner_agreement_consents')
        .select('signed_at, signer_name, agreement_version')
        .eq('partner_id', partnerId)
        .eq('agreement_type', SERVICE_AGREEMENT.type)
        .order('signed_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (!data) return none
    return {
        signed: true,
        signed_at: data.signed_at,
        signer_name: data.signer_name,
        version: data.agreement_version,
        current: data.agreement_version === SERVICE_AGREEMENT.version,
    }
}

/** Signed URL to view the base (HangHut-filled) Service Agreement PDF. */
export async function getServiceAgreementViewUrl(): Promise<{ url?: string; error?: string }> {
    const { user } = await getAuthUser()
    if (!user) return { error: 'Unauthorized' }
    const { data, error } = await admin()
        .storage.from(SERVICE_AGREEMENT.templateBucket)
        .createSignedUrl(SERVICE_AGREEMENT.templatePath, 3600)
    if (error || !data) return { error: 'The Service Agreement is not available yet. Please contact support.' }
    return { url: data.signedUrl }
}

/**
 * Record the partner's e-signature: capture the audit trail (name/email/IP/timestamp),
 * hash the exact document, append an Audit Trail page to the PDF, store it, and wire it
 * into the KYC document set as SERVICE_AGREEMENT (→ SERVICE_AGREEMENT_DOCUMENT at submit).
 */
export async function signServiceAgreement(signerName: string): Promise<{ success?: boolean; error?: string }> {
    const { user } = await getAuthUser()
    if (!user) return { error: 'Unauthorized' }
    const partnerId = await getPartnerId(user.id)
    if (!partnerId) return { error: 'No partner account' }
    if (!signerName || signerName.trim().length < 2) return { error: 'Enter your full legal name.' }

    const a = admin()

    const { data: partner } = await a
        .from('partners')
        .select('id, user_id, business_name, work_email, authorized_person_email')
        .eq('id', partnerId)
        .single()
    if (!partner) return { error: 'Partner not found' }

    // Audit context (captured at the moment of signing)
    const h = await headers()
    const ip = (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || null
    const userAgent = h.get('user-agent') || null
    const signerEmail = user.email || partner.authorized_person_email || partner.work_email || null
    const signedAt = new Date()
    const consentId = randomUUID()

    // 1. Download the base SA template (the exact document being signed)
    const { data: baseBlob, error: dlErr } = await a
        .storage.from(SERVICE_AGREEMENT.templateBucket)
        .download(SERVICE_AGREEMENT.templatePath)
    if (dlErr || !baseBlob) return { error: 'The Service Agreement document is not available. Please contact support.' }
    const baseBytes = new Uint8Array(await baseBlob.arrayBuffer())

    // 2. Hash it (proves exactly what was signed)
    const documentHash = createHash('sha256').update(baseBytes).digest('hex')

    // 3. Append the Audit Trail page (ASCII only — Helvetica/WinAnsi can't encode smart quotes).
    //    The template's last page is a PLACEHOLDER audit-trail page ("to be populated by the
    //    e-signature platform") — drop it and append our own populated one so there's exactly one.
    const pdf = await PDFDocument.load(baseBytes)
    if (pdf.getPageCount() > 0) pdf.removePage(pdf.getPageCount() - 1)
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const page = pdf.addPage()
    const { height } = page.getSize()
    const margin = 64
    let y = height - margin
    const row = (label: string, value: string) => {
        page.drawText(label, { x: margin, y, size: 10, font: bold, color: rgb(0.1, 0.1, 0.1) })
        page.drawText(value, { x: margin + 150, y, size: 10, font, color: rgb(0.1, 0.1, 0.1) })
        y -= 22
    }
    page.drawText('AUDIT TRAIL', { x: margin, y, size: 14, font: bold }); y -= 32
    page.drawText('Electronic execution record for this Services Agreement.', { x: margin, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) }); y -= 30
    row('Signed by:', signerName.trim())
    row('On behalf of:', partner.business_name || '-')
    if (signerEmail) row('Email address:', signerEmail)
    row('IP address:', ip || 'unavailable')
    row('Date and time (UTC):', signedAt.toISOString())
    row('Agreement version:', SERVICE_AGREEMENT.version)
    row('Consent ID:', consentId)
    y -= 6
    page.drawText('Document SHA-256:', { x: margin, y, size: 10, font: bold }); y -= 15
    page.drawText(documentHash, { x: margin, y, size: 8, font, color: rgb(0.3, 0.3, 0.3) }); y -= 26
    page.drawText("Generated by HangHut upon the signer's electronic acceptance.", { x: margin, y, size: 8, font, color: rgb(0.4, 0.4, 0.4) })

    const signedBytes = await pdf.save()

    // 4. Store the signed PDF (with PII) in the PRIVATE kyc-documents bucket
    const path = `${partner.user_id}/service_agreement/${consentId}.pdf`
    const { error: upErr } = await a
        .storage.from(SERVICE_AGREEMENT.signedBucket)
        .upload(path, signedBytes, { contentType: 'application/pdf', upsert: true })
    if (upErr) return { error: 'Failed to store the signed agreement: ' + upErr.message }

    // 5. Record the consent
    const { error: consentErr } = await a.from('partner_agreement_consents').insert({
        partner_id: partnerId,
        agreement_type: SERVICE_AGREEMENT.type,
        agreement_version: SERVICE_AGREEMENT.version,
        document_hash: documentHash,
        signer_name: signerName.trim(),
        signer_email: signerEmail,
        signer_ip: ip,
        user_agent: userAgent,
        signed_at: signedAt.toISOString(),
        consent_id: consentId,
        pdf_storage_path: path,
    })
    if (consentErr) return { error: 'Failed to record consent: ' + consentErr.message }

    // 6. Wire it into KYC docs — replace any prior SA so submit-xendit-kyc uses the latest
    await a.from('partner_kyc_documents')
        .delete()
        .eq('partner_id', partnerId)
        .eq('owner_kind', 'business')
        .eq('doc_type', 'SERVICE_AGREEMENT')
    await a.from('partner_kyc_documents').insert({
        partner_id: partnerId,
        owner_kind: 'business',
        owner_id: null,
        doc_type: 'SERVICE_AGREEMENT',
        storage_path: path,
    })

    revalidatePath('/organizer/verification')
    return { success: true }
}
