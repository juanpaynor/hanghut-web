'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { submitKYCVerification, type KYCFormState } from '@/lib/organizer/verification-actions'
import {
    ENTITY_TYPES, BUSINESS_INTENTS, SOURCE_OF_FUNDS, MONEY_OUT_FREQUENCY, BASKET_SIZE,
    GENDER, STAKEHOLDER_ROLES, ID_TYPES, requiresStakeholders, isSinglePerson,
    type StructuredAddress, type EntityType, idNeedsProofOfResidency,
} from '@/lib/organizer/kyc-constants'
import {
    Upload, FileText, X, CheckCircle, ArrowRight, ArrowLeft, Plus, Trash2, User, Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

// KYC docs upload straight to the private kyc-documents bucket, which caps each file
// at 5MB and accepts only JPG / PNG / PDF. Validate client-side for a clear message
// (esp. iPhone HEIC photos, which the bucket rejects).
const MAX_DOC_BYTES = 5 * 1024 * 1024
const ALLOWED_DOC_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
function validateFile(f: File): string | null {
    if (f.size > MAX_DOC_BYTES) return `this file is ${(f.size / 1024 / 1024).toFixed(1)}MB — the max is 5MB. Please compress it or upload a smaller scan.`
    if (f.type && !ALLOWED_DOC_TYPES.includes(f.type)) return `unsupported format (${f.type}). Use JPG, PNG or PDF — iPhone HEIC photos won't work, save as JPG first.`
    return null
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Person = {
    first_name: string; last_name: string; gender?: string; date_of_birth?: string
    role?: string; nationality?: string; email?: string
    mobile_country_code?: string; mobile_number?: string
    id_type?: string; id_number?: string; address?: StructuredAddress
}
type Stakeholder = {
    roles: string[]; first_name: string; last_name: string; nationality?: string
    date_of_birth?: string; is_authorized_person?: boolean; id_type?: string
    id_number?: string; address?: StructuredAddress
}

export type KYCExistingData = {
    business_type?: string
    business_name?: string
    /** Partner's public links; the KYC website lives at social_links.website. */
    social_links?: Record<string, string> | null
    business_industry_subcategory?: string
    business_establishment_date?: string
    business_intents?: string[]
    business_source_of_funds?: string[]
    business_average_monthly_basket_size?: string
    money_out_transaction_frequency?: string
    business_phone_country_code?: string
    business_phone_number?: string
    tax_id?: string
    /** SEC/DTI registration number — Required by /account_verification. */
    registration_number?: string
    /** Factual business description for KYC review (not storefront copy). */
    business_description?: string
    shareholders_include_corporate_entity?: boolean | null
    street_line1?: string
    street_line2?: string
    city?: string
    province_state?: string
    postal_code?: string
    legal_entity_address?: StructuredAddress | null
    authorized_person_first_name?: string
    authorized_person_last_name?: string
    authorized_person_gender?: string
    authorized_person_date_of_birth?: string
    authorized_person_nationality?: string
    authorized_person_email?: string
    representative_name?: string
    nationality?: string
    contact_number?: string
    work_email?: string
    /** slot ("business:PH_BIR_2303" | "authorized:ID_FRONT") -> existing storage path */
    existing_docs?: Record<string, string>
}

// ─── Reusable bits ──────────────────────────────────────────────────────────
function StepIndicator({ currentStep, steps }: { currentStep: number; steps: string[] }) {
    return (
        <div className="flex items-center justify-center gap-0 mb-8 flex-wrap">
            {steps.map((label, i) => {
                const n = i + 1
                const active = n === currentStep
                const done = n < currentStep
                return (
                    <div key={i} className="flex items-center">
                        <div className="flex flex-col items-center">
                            <div className={cn(
                                'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all',
                                done && 'bg-green-500 text-white',
                                active && 'bg-primary text-primary-foreground ring-4 ring-primary/20',
                                !active && !done && 'bg-muted text-muted-foreground',
                            )}>
                                {done ? <CheckCircle className="h-4 w-4" /> : n}
                            </div>
                            <span className={cn('text-[10px] mt-1 font-medium whitespace-nowrap',
                                active ? 'text-primary' : done ? 'text-green-600' : 'text-muted-foreground')}>{label}</span>
                        </div>
                        {i < steps.length - 1 && <div className={cn('w-8 sm:w-12 h-0.5 mx-1 mb-4', done ? 'bg-green-500' : 'bg-muted')} />}
                    </div>
                )
            })}
        </div>
    )
}

function FileDropZone({ docType, label, hint, file, hasExisting, onFileChange, templateUrl }: {
    docType: string; label: string; hint: string; file: File | null
    hasExisting: boolean; onFileChange: (f: File | null) => void
    /** Where a blank version of this document can be downloaded, when one exists. */
    templateUrl?: string
}) {
    const [dragging, setDragging] = useState(false)
    const id = `file-${docType}-${Math.random().toString(36).slice(2, 7)}`
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setDragging(false)
        const f = e.dataTransfer.files[0]; if (f) onFileChange(f)
    }, [onFileChange])
    const showExisting = hasExisting && !file
    return (
        <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
                <Label className="text-sm font-medium">{label}</Label>
                {templateUrl && (
                    /* Outside the drop zone on purpose: the zone's onClick opens the
                       file picker, so a link nested inside it could never be reached. */
                    <a
                        href={templateUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                        <Download className="h-3 w-3" />
                        Download template
                    </a>
                )}
            </div>
            <div
                className={cn('relative border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all',
                    dragging && 'border-primary bg-primary/5',
                    file ? 'border-green-400 bg-green-500/5' : showExisting ? 'border-blue-400 bg-blue-500/5' : 'border-muted-foreground/20 hover:border-primary/50')}
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => document.getElementById(id)?.click()}
            >
                <input id={id} type="file" accept="image/*,.pdf" className="sr-only"
                    onChange={(e) => onFileChange(e.target.files?.[0] || null)} />
                {file ? (
                    <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-green-600 shrink-0" />
                        <div className="text-left min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                        </div>
                        <button type="button" className="p-1.5 rounded-full hover:bg-destructive/10"
                            onClick={(e) => { e.stopPropagation(); onFileChange(null) }}><X className="h-4 w-4 text-muted-foreground" /></button>
                    </div>
                ) : showExisting ? (
                    <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-blue-600 shrink-0" />
                        <div className="text-left flex-1">
                            <p className="text-sm font-medium">Previously uploaded</p>
                            <p className="text-xs text-muted-foreground">Click to replace</p>
                        </div>
                        <CheckCircle className="h-5 w-5 text-blue-500 shrink-0" />
                    </div>
                ) : (
                    <div className="py-1.5">
                        <Upload className="h-5 w-5 mx-auto text-muted-foreground/50 mb-1" />
                        <p className="text-sm text-muted-foreground"><span className="text-primary font-medium">Upload</span> or drag & drop</p>
                    </div>
                )}
            </div>
            <p className="text-xs text-muted-foreground/80 pl-1">{hint}</p>
        </div>
    )
}

function MultiCheck({ label, options, selected, onToggle }: {
    label: string; options: readonly { value: string; label: string }[]; selected: string[]; onToggle: (v: string) => void
}) {
    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            <div className="grid grid-cols-2 gap-2">
                {options.map(o => (
                    <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer rounded-lg border p-2 hover:bg-muted/50">
                        <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => onToggle(o.value)} />
                        <span>{o.label}</span>
                    </label>
                ))}
            </div>
        </div>
    )
}

function AddressFields({ value, onChange, label }: { value: StructuredAddress; onChange: (a: StructuredAddress) => void; label: string }) {
    const set = (k: keyof StructuredAddress, v: string) => onChange({ ...value, [k]: v })
    return (
        <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">{label}</Label>
            <Input placeholder="Street address" value={value.street_line1 || ''} onChange={(e) => set('street_line1', e.target.value)} />
            <Input placeholder="Unit / floor / building (optional)" value={value.street_line2 || ''} onChange={(e) => set('street_line2', e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
                <Input placeholder="City" value={value.city || ''} onChange={(e) => set('city', e.target.value)} />
                <Input placeholder="Province / region" value={value.province_state || ''} onChange={(e) => set('province_state', e.target.value)} />
            </div>
            <Input placeholder="Postal code" value={value.postal_code || ''} onChange={(e) => set('postal_code', e.target.value)} className="w-1/2" />
        </div>
    )
}

// ─── Doc-slot config ─────────────────────────────────────────────────────────
// Per Xendit's official PH document requirements per entity type.
// SERVICE_AGREEMENT is required for ALL entities; partnership differs from
// corporation (Articles of Partnership + Notarized Partner's Certificate, no GIS).
// This is Xendit's sub-merchant Service Agreement (Xendit ↔ partner), with HangHut
// named as the Platform Account Holder — NOT a HangHut-drafted agreement.
// Xendit's own blank Secretary's Certificate. Submissions were rejected for using
// a version that didn't name Xendit Philippines, Inc., so hand partners the correct
// document at the moment they're asked for it rather than in an email they'll lose.
const SECRETARY_CERT_TEMPLATE_URL =
    'https://api.hanghut.com/storage/v1/object/public/XENDIT-SECCERT/Secretary-certificate/secretary_cert.docx'

// business_license_documents is Required for PH. Xendit PH support confirmed the
// Mayor's Permit satisfies it — it was never collected, so no partner has one.
const MAYORS_PERMIT_SLOT = { type: 'PH_MAYORS_PERMIT', label: "Mayor's Permit", hint: 'Current business permit from your city or municipality' }
const SERVICE_AGREEMENT_SLOT = { type: 'SERVICE_AGREEMENT', label: 'Service Agreement', hint: 'Signed Xendit Service Agreement (HangHut as your platform)' }
// Xendit rejects submissions with "Please provide the use case and payment flow"
// against BUSINESS_PROOF_DOCUMENT. Required for EVERY entity type — a registration
// certificate proves the company exists; this proves it trades, and that money moves
// the way the application says it does.
const BUSINESS_PROOF_SLOT = {
    type: 'BUSINESS_PROOF',
    label: 'Use Case & Payment Flow',
    hint: 'One PDF showing what you sell and how a customer pays for it end to end: your page, choosing a ticket, checkout, the payment screen, and the confirmation they receive. Screenshots are fine.',
}
function businessDocSlots(entity: string): { type: string; label: string; hint: string; templateUrl?: string }[] {
    if (entity === 'sole_proprietorship') return [
        { type: 'PH_DTI_CERTIFICATE_REGISTRATION', label: 'DTI Registration', hint: 'DTI business name registration' },
        { type: 'PH_BIR_2303', label: 'BIR Form 2303', hint: 'BIR Certificate of Registration' },
        BUSINESS_PROOF_SLOT,
        SERVICE_AGREEMENT_SLOT,
    ]
    if (entity === 'corporation') return [
        { type: 'PH_SEC_CERTIFICATE_REGISTRATION', label: 'SEC Certificate of Registration', hint: 'SEC registration certificate' },
        { type: 'PH_BIR_2303', label: 'BIR Form 2303', hint: 'BIR Certificate of Registration' },
        { type: 'PH_ARTICLES_OF_INCORPORATION', label: 'Articles of Incorporation', hint: 'Notarized copy' },
        {
            type: 'PH_NOTARIZED_SECRETARY_CERTIFICATE',
            label: "Notarized Secretary's Certificate",
            // The two things Xendit rejected submissions over, said plainly.
            hint: 'Must name Xendit Philippines, Inc. and the same authorized person you entered above. Notarized.',
            templateUrl: SECRETARY_CERT_TEMPLATE_URL,
        },
        { type: 'PH_GIS', label: 'Latest GIS', hint: 'Most recent General Information Sheet filed with SEC' },
        MAYORS_PERMIT_SLOT,
        BUSINESS_PROOF_SLOT,
        SERVICE_AGREEMENT_SLOT,
    ]
    if (entity === 'partnership') return [
        { type: 'PH_SEC_CERTIFICATE_REGISTRATION', label: 'SEC Certificate of Registration', hint: 'SEC registration certificate' },
        { type: 'PH_BIR_2303', label: 'BIR Form 2303', hint: 'BIR Certificate of Registration' },
        { type: 'PH_ARTICLES_OF_PARTNERSHIP', label: 'Articles of Partnership', hint: 'Notarized Articles of Partnership' },
        { type: 'PH_NOTARIZED_PARTNER_CERTIFICATE', label: "Notarized Partner's Certificate", hint: 'Notarized certificate authorizing the representative' },
        MAYORS_PERMIT_SLOT,
        BUSINESS_PROOF_SLOT,
        SERVICE_AGREEMENT_SLOT,
    ]
    return [BUSINESS_PROOF_SLOT, SERVICE_AGREEMENT_SLOT] // individual: + person ID/selfie
}
/**
 * Person document slots depend on the ID they chose.
 *
 * Xendit requires `proof_of_residency_document` whenever the ID does not itself
 * show a residential address — a passport being the case they name. Asking for
 * it conditionally is the whole point: demanding a utility bill from someone
 * submitting a driver's licence is noise, and NOT demanding it from someone
 * submitting a passport is a rejection nobody sees for days.
 */
const PROOF_OF_RESIDENCY_SLOT = {
    type: 'PROOF_OF_RESIDENCY',
    label: 'Proof of address',
    hint: 'Utility bill or bank statement showing the home address — required because a passport does not show one',
}
function authDocSlots(idType?: string) {
    return [
        { type: 'ID_FRONT', label: 'Government ID — Front', hint: 'Front of a valid government ID' },
        { type: 'ID_BACK', label: 'Government ID — Back', hint: 'Back of the same ID' },
        { type: 'SELFIE', label: 'Selfie with ID', hint: 'A selfie holding your ID (for liveness)' },
        ...(idNeedsProofOfResidency(idType) ? [PROOF_OF_RESIDENCY_SLOT] : []),
    ]
}
function stakeholderDocSlots(idType?: string) {
    return [
        { type: 'ID_FRONT', label: 'ID — Front', hint: 'Front of a valid government ID' },
        { type: 'ID_BACK', label: 'ID — Back', hint: 'Back of the same ID' },
        ...(idNeedsProofOfResidency(idType) ? [PROOF_OF_RESIDENCY_SLOT] : []),
    ]
}

// ─── Main form ────────────────────────────────────────────────────────────────
export function KYCVerificationForm({ existingData, adminPartnerId }: {
    existingData?: KYCExistingData
    /** Set when a HangHut admin is completing this for a partner. Submitted with
     *  the form so the server can re-check admin rights — the presence of this
     *  prop is a UI hint, never the authorisation itself. */
    adminPartnerId?: string
}) {
    const ex = existingData || {}
    const existingDocs = ex.existing_docs || {}

    const [state, setState] = useState<KYCFormState | undefined>(undefined)
    const [loading, setLoading] = useState(false)
    const [step, setStep] = useState(1)

    const [entityType, setEntityType] = useState<EntityType | ''>((ex.business_type as EntityType) || '')

    // Business profile
    const [industrySub, setIndustrySub] = useState(ex.business_industry_subcategory || '')
    const [establishmentDate, setEstablishmentDate] = useState(ex.business_establishment_date || '')
    const [intents, setIntents] = useState<string[]>(ex.business_intents || ['PAYMENTS'])
    const [sourceFunds, setSourceFunds] = useState<string[]>(ex.business_source_of_funds || [])
    const [basketSize, setBasketSize] = useState(ex.business_average_monthly_basket_size || '')
    const [moneyOut, setMoneyOut] = useState(ex.money_out_transaction_frequency || '')
    const [bizPhoneCC, setBizPhoneCC] = useState(ex.business_phone_country_code || '+63')
    const [bizPhone, setBizPhone] = useState(ex.business_phone_number || '')
    const [taxId, setTaxId] = useState(ex.tax_id || '')
    // Required by /account_verification. The legacy account_holders API REJECTED
    // this field, which is why it is null on every partner created before now.
    const [registrationNumber, setRegistrationNumber] = useState(ex.registration_number || '')
    const [businessDescription, setBusinessDescription] = useState(ex.business_description || '')
    const [website, setWebsite] = useState(((ex.social_links as any) || {}).website || '')
    // Drives whether a shareholding-chart document is also required, so it has to
    // be answered before we can tell the partner which documents to bring.
    const [corporateShareholders, setCorporateShareholders] = useState<boolean | null>(
        typeof ex.shareholders_include_corporate_entity === 'boolean' ? ex.shareholders_include_corporate_entity : null
    )
    const [bizAddress, setBizAddress] = useState<StructuredAddress>({
        street_line1: ex.street_line1 || '',
        street_line2: ex.street_line2 || '',
        city: ex.city || '',
        province_state: ex.province_state || '',
        postal_code: ex.postal_code || '',
    })
    const [legalAddress, setLegalAddress] = useState<StructuredAddress>(ex.legal_entity_address || {})
    // Most PH SMEs operate from their registered address; default to "same" so the
    // common case is one form fill, not two.
    const [legalSameAsBusiness, setLegalSameAsBusiness] = useState(!ex.legal_entity_address)

    // Authorized person (prefill from registration where possible)
    const repParts = (ex.representative_name || '').trim().split(' ')
    const [auth, setAuth] = useState<Person>({
        first_name: ex.authorized_person_first_name || repParts[0] || '',
        last_name: ex.authorized_person_last_name || (repParts.length > 1 ? repParts.slice(1).join(' ') : ''),
        gender: ex.authorized_person_gender || '',
        date_of_birth: ex.authorized_person_date_of_birth || '',
        nationality: ex.authorized_person_nationality || ex.nationality || 'Filipino',
        email: ex.authorized_person_email || ex.work_email || '',
        mobile_country_code: '+63',
        mobile_number: (ex.contact_number || '').replace(/^\+\d{1,3}/, ''),
        role: '', id_type: '', id_number: '', address: {},
    })

    // Contact person (corp/partnership only)
    const [contact, setContact] = useState<Person>({ first_name: '', last_name: '', email: '', mobile_country_code: '+63', mobile_number: '' })

    // Stakeholders (corp/partnership only)
    const [stakeholders, setStakeholders] = useState<Stakeholder[]>([{ roles: [], first_name: '', last_name: '', address: {} }])

    // Document files. key = slot string ("business:PH_BIR_2303" | "authorized:ID_FRONT" | "stakeholder:ID_FRONT:0")
    const [files, setFiles] = useState<Record<string, File | null>>({})
    const [fileError, setFileError] = useState<string | null>(null)
    const setFile = (slot: string, f: File | null) => {
        if (f) {
            const err = validateFile(f)
            if (err) { setFileError(`${slot.split(':')[1].replace(/_/g, ' ')}: ${err}`); return }
        }
        setFileError(null)
        setFiles(prev => ({ ...prev, [slot]: f }))
    }

    const single = isSinglePerson(entityType)
    const corp = requiresStakeholders(entityType)

    const steps = corp
        ? ['Business', 'People', 'Stakeholders', 'Documents', 'Review']
        : ['Business', 'Authorized Person', 'Documents', 'Review']

    const setAuthField = (k: keyof Person, v: any) => setAuth(p => ({ ...p, [k]: v }))
    const setContactField = (k: keyof Person, v: any) => setContact(p => ({ ...p, [k]: v }))
    const toggle = (arr: string[], v: string) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]

    const updateStakeholder = (i: number, patch: Partial<Stakeholder>) =>
        setStakeholders(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
    const addStakeholder = () => setStakeholders(prev => [...prev, { roles: [], first_name: '', last_name: '', address: {} }])
    const removeStakeholder = (i: number) => setStakeholders(prev => prev.filter((_, idx) => idx !== i))

    const bizSlots = businessDocSlots(entityType)

    async function handleSubmit() {
        setLoading(true); setState(undefined)
        const fd = new FormData()
        fd.append('entityType', entityType)
        fd.append('business', JSON.stringify({
            industry_subcategory: industrySub, establishment_date: establishmentDate || undefined,
            intents, source_of_funds: sourceFunds, average_monthly_basket_size: basketSize || undefined,
            money_out_frequency: moneyOut || undefined, phone_country_code: bizPhoneCC, phone_number: bizPhone,
            tax_id: taxId.trim() || undefined,
            registration_number: registrationNumber.trim() || undefined,
            business_description: businessDescription.trim() || undefined,
            website: website.trim() || undefined,
            shareholders_include_corporate_entity: corporateShareholders ?? undefined,
            business_address: bizAddress,
            // "Same as business" is stored explicitly rather than left null, so the
            // submission always carries a registered address.
            legal_entity_address: legalSameAsBusiness ? bizAddress : legalAddress,
        }))
        fd.append('authorizedPerson', JSON.stringify(auth))
        if (corp) fd.append('contactPerson', JSON.stringify(contact))
        if (corp) fd.append('stakeholders', JSON.stringify(stakeholders))

        // Upload documents straight to storage from the browser — keeps the submission
        // body tiny (avoids Vercel's ~4.5MB server-action limit). We send the resulting
        // storage paths, not the files themselves.
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setState({ message: 'Your session expired. Please sign in again.' }); setLoading(false); return }

        const uploaded: Record<string, string> = {}
        for (const [slot, f] of Object.entries(files)) {
            if (!f) continue
            const err = validateFile(f)
            if (err) { setState({ message: `${slot.split(':')[1].replace(/_/g, ' ')}: ${err}` }); setLoading(false); return }
            const ext = (f.name.split('.').pop() || 'file').toLowerCase()
            const docType = slot.split(':')[1]
            const path = `${user.id}/${docType.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`
            const { error } = await supabase.storage.from('kyc-documents')
                .upload(path, f, { upsert: true, contentType: f.type })
            if (error) {
                setState({ message: `Couldn't upload ${docType.replace(/_/g, ' ')}: ${error.message}` })
                setLoading(false); return
            }
            uploaded[slot] = path
        }
        fd.append('uploaded', JSON.stringify(uploaded))

        // Carry forward business + authorized docs not replaced this session.
        const reuse: Record<string, string> = {}
        for (const [slot, path] of Object.entries(existingDocs)) {
            if (!files[slot] && path) reuse[slot] = path
        }
        fd.append('reuse', JSON.stringify(reuse))

        // Presence alone grants nothing: the server re-reads is_admin with the
        // service role before honouring it.
        if (adminPartnerId) fd.append('partnerId', adminPartnerId)

        const result = await submitKYCVerification(undefined, fd)
        setState(result)
        setLoading(false)
    }

    const canNextBusiness = entityType && intents.length && sourceFunds.length && moneyOut
    // Residential address is required — Xendit needs it on the individual for card
    // capability approval (PH_CARDS). Gate the People step until it's filled.
    const canNextPeople = auth.first_name.trim() && auth.last_name.trim() && auth.date_of_birth
        && (auth.address?.street_line1 || '').trim() && (auth.address?.city || '').trim()

    return (
        <div className="space-y-6">
            <StepIndicator currentStep={step} steps={steps} />

            {/* STEP 1 — Business profile */}
            {step === 1 && (
                <div className="space-y-5">
                    <div>
                        <h2 className="text-xl font-bold">Business Profile</h2>
                        <p className="text-sm text-muted-foreground mt-1">Tell us about your business{ex.business_name ? ` — ${ex.business_name}` : ''}</p>
                    </div>
                    <div className="space-y-2">
                        <Label>Business Type</Label>
                        <Select value={entityType} onValueChange={(v) => setEntityType(v as EntityType)}>
                            <SelectTrigger><SelectValue placeholder="Select business type" /></SelectTrigger>
                            <SelectContent>
                                {ENTITY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label>Industry Subcategory</Label>
                            <Input value={industrySub} onChange={(e) => setIndustrySub(e.target.value)} placeholder="e.g. Event ticketing" />
                        </div>
                        <div className="space-y-2">
                            <Label>Establishment Date</Label>
                            <Input type="date" value={establishmentDate} onChange={(e) => setEstablishmentDate(e.target.value)} />
                        </div>
                    </div>
                    <MultiCheck label="What will you use HangHut payments for?" options={BUSINESS_INTENTS} selected={intents} onToggle={(v) => setIntents(toggle(intents, v))} />
                    <MultiCheck label="Source of funds" options={SOURCE_OF_FUNDS} selected={sourceFunds} onToggle={(v) => setSourceFunds(toggle(sourceFunds, v))} />
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label>Avg. monthly transaction size</Label>
                            <Select value={basketSize} onValueChange={setBasketSize}>
                                <SelectTrigger><SelectValue placeholder="Select range" /></SelectTrigger>
                                <SelectContent>{BASKET_SIZE.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Payout frequency</Label>
                            <Select value={moneyOut} onValueChange={setMoneyOut}>
                                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                <SelectContent>{MONEY_OUT_FREQUENCY.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Business Phone</Label>
                        <div className="flex gap-2">
                            <Input value={bizPhoneCC} onChange={(e) => setBizPhoneCC(e.target.value)} className="w-20" />
                            <Input value={bizPhone} onChange={(e) => setBizPhone(e.target.value.replace(/[^0-9]/g, ''))} placeholder="9171234567" className="flex-1" />
                        </div>
                    </div>
                    {/* TIN + business address: Xendit needs both on the business entity
                        (the TIN gates the cards capability). Neither was collected
                        anywhere before, so they could never be sent. */}
                    <div className="space-y-2">
                        <Label>Tax Identification Number (TIN)</Label>
                        <Input
                            value={taxId}
                            onChange={(e) => setTaxId(e.target.value)}
                            placeholder="000-000-000-000"
                        />
                        <p className="text-xs text-muted-foreground">
                            As shown on your BIR 2303. Required before card payments can be enabled.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label>SEC / DTI Registration Number</Label>
                        <Input
                            value={registrationNumber}
                            onChange={(e) => setRegistrationNumber(e.target.value)}
                            placeholder="e.g. CS201812345"
                        />
                        <p className="text-xs text-muted-foreground">
                            The registration number printed on your SEC (or DTI) certificate.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label>What does the business do?</Label>
                        <Textarea
                            value={businessDescription}
                            onChange={(e) => setBusinessDescription(e.target.value)}
                            placeholder="e.g. We produce and promote live music events and sell tickets to them."
                            rows={3}
                        />
                        <p className="text-xs text-muted-foreground">
                            A plain description for the compliance reviewer — not marketing copy.
                        </p>
                    </div>
                    {/* One URL is all the provider stores — but they OPEN it, and check the
                        page against a list. Saying so here is the difference between a
                        rejection weeks later and a link that passes first time. */}
                    <div className="space-y-2">
                        <Label>Business website</Label>
                        <Input
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            placeholder="yourbusiness.com"
                        />
                        <p className="text-xs text-muted-foreground">
                            Leave blank to use your HangHut storefront. Whichever you give,
                            the reviewer opens it and expects to find: your registered
                            business name as it appears on your SEC/DTI certificate, your
                            registered address, contact details, and links to Terms &amp;
                            Conditions, a Privacy Policy, and a Cancellation/Refund Policy.
                            A site missing these is the single most common rejection.
                        </p>
                    </div>
                    {corp && (
                        <div className="space-y-2">
                            <Label>Is any shareholder a company rather than a person?</Label>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant={corporateShareholders === false ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setCorporateShareholders(false)}
                                >No — all individuals</Button>
                                <Button
                                    type="button"
                                    variant={corporateShareholders === true ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setCorporateShareholders(true)}
                                >Yes — a company holds shares</Button>
                            </div>
                            {corporateShareholders === true && (
                                <p className="text-xs text-amber-700">
                                    A shareholding chart will also be required.
                                </p>
                            )}
                        </div>
                    )}
                    <AddressFields
                        label="Business address (required)"
                        value={bizAddress}
                        onChange={setBizAddress}
                    />
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={legalSameAsBusiness}
                                onChange={(e) => setLegalSameAsBusiness(e.target.checked)}
                            />
                            Registered address is the same as the business address
                        </label>
                        {!legalSameAsBusiness && (
                            <AddressFields
                                label="Registered address (as filed with SEC/DTI)"
                                value={legalAddress}
                                onChange={setLegalAddress}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* STEP 2 — Authorized person (+ contact for corp) */}
            {step === 2 && (
                <div className="space-y-5">
                    <div>
                        <h2 className="text-xl font-bold">{single ? 'Your Details' : 'Authorized & Contact Person'}</h2>
                        <p className="text-sm text-muted-foreground mt-1">{single ? 'Identity of the account holder' : 'Authorized signatory and day-to-day contact'}</p>
                    </div>
                    <PersonForm person={auth} setField={setAuthField} showRole={!single} showContact />
                    {!single && (
                        <div className="border-t pt-4 space-y-3">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Contact Person</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <Input placeholder="First name" value={contact.first_name} onChange={(e) => setContactField('first_name', e.target.value)} />
                                <Input placeholder="Last name" value={contact.last_name} onChange={(e) => setContactField('last_name', e.target.value)} />
                            </div>
                            <Input placeholder="Email" type="email" value={contact.email || ''} onChange={(e) => setContactField('email', e.target.value)} />
                            <div className="flex gap-2">
                                <Input value={contact.mobile_country_code || '+63'} onChange={(e) => setContactField('mobile_country_code', e.target.value)} className="w-20" />
                                <Input placeholder="Mobile number" value={contact.mobile_number || ''} onChange={(e) => setContactField('mobile_number', e.target.value.replace(/[^0-9]/g, ''))} className="flex-1" />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* STEP 3 (corp only) — Stakeholders */}
            {step === 3 && corp && (
                <div className="space-y-5">
                    <div>
                        <h2 className="text-xl font-bold">Stakeholders</h2>
                        <p className="text-sm text-muted-foreground mt-1">Include at least one Board Director and one Business Owner.</p>
                    </div>
                    {stakeholders.map((s, i) => (
                        <div key={i} className="rounded-xl border p-4 space-y-3 relative">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm font-semibold"><User className="h-4 w-4 text-primary" /> Stakeholder {i + 1}</div>
                                {stakeholders.length > 1 && (
                                    <button type="button" onClick={() => removeStakeholder(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                                )}
                            </div>
                            <MultiCheck label="Roles" options={STAKEHOLDER_ROLES} selected={s.roles} onToggle={(v) => updateStakeholder(i, { roles: toggle(s.roles, v) })} />
                            <div className="grid grid-cols-2 gap-3">
                                <Input placeholder="First name" value={s.first_name} onChange={(e) => updateStakeholder(i, { first_name: e.target.value })} />
                                <Input placeholder="Last name" value={s.last_name} onChange={(e) => updateStakeholder(i, { last_name: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1"><Label className="text-xs">Date of birth</Label>
                                    <Input type="date" value={s.date_of_birth || ''} onChange={(e) => updateStakeholder(i, { date_of_birth: e.target.value })} /></div>
                                <div className="space-y-1"><Label className="text-xs">Nationality</Label>
                                    <Input value={s.nationality || ''} onChange={(e) => updateStakeholder(i, { nationality: e.target.value })} placeholder="Filipino" /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1"><Label className="text-xs">ID type</Label>
                                    <Select value={s.id_type || ''} onValueChange={(v) => updateStakeholder(i, { id_type: v })}>
                                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                        <SelectContent>{ID_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                                    </Select></div>
                                <div className="space-y-1"><Label className="text-xs">ID number</Label>
                                    <Input value={s.id_number || ''} onChange={(e) => updateStakeholder(i, { id_number: e.target.value })} /></div>
                            </div>
                            <AddressFields label="Residential address" value={s.address || {}} onChange={(a) => updateStakeholder(i, { address: a })} />
                            <div className="grid grid-cols-2 gap-3">
                                {stakeholderDocSlots(s.id_type).map(d => (
                                    <FileDropZone key={d.type} docType={`stakeholder:${d.type}:${i}`} label={d.label} hint={d.hint}
                                        file={files[`stakeholder:${d.type}:${i}`] || null} hasExisting={false}
                                        onFileChange={(f) => setFile(`stakeholder:${d.type}:${i}`, f)} />
                                ))}
                            </div>
                        </div>
                    ))}
                    <Button type="button" variant="outline" onClick={addStakeholder} className="w-full"><Plus className="h-4 w-4 mr-2" /> Add stakeholder</Button>
                </div>
            )}

            {/* DOCUMENTS step */}
            {((corp && step === 4) || (!corp && step === 3)) && (
                <div className="space-y-5">
                    <div>
                        <h2 className="text-xl font-bold">Documents</h2>
                        <p className="text-sm text-muted-foreground mt-1">Upload the documents required for your business type — JPG, PNG or PDF, up to 5MB each.</p>
                    </div>
                    {fileError && (
                        <div className="p-3 rounded-md text-sm bg-red-50 text-red-800 capitalize">{fileError}</div>
                    )}
                    {bizSlots.length > 0 && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Business Documents</h3>
                            {bizSlots.map(d => {
                                const slot = `business:${d.type}`
                                return <FileDropZone key={slot} docType={slot} label={d.label} hint={d.hint}
                                    templateUrl={d.templateUrl}
                                    file={files[slot] || null} hasExisting={!!existingDocs[slot]} onFileChange={(f) => setFile(slot, f)} />
                            })}
                        </div>
                    )}
                    <div className="space-y-3 border-t pt-4">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Authorized Person ID</h3>
                        {authDocSlots(auth.id_type).map(d => {
                            const slot = `authorized:${d.type}`
                            return <FileDropZone key={slot} docType={slot} label={d.label} hint={d.hint}
                                file={files[slot] || null} hasExisting={!!existingDocs[slot]} onFileChange={(f) => setFile(slot, f)} />
                        })}
                    </div>
                </div>
            )}

            {/* REVIEW step */}
            {step === steps.length && (
                <div className="space-y-5">
                    <div>
                        <h2 className="text-xl font-bold">Review & Submit</h2>
                        <p className="text-sm text-muted-foreground mt-1">Confirm before sending for verification</p>
                    </div>
                    <div className="rounded-xl border p-4 space-y-1.5 text-sm">
                        <p><span className="text-muted-foreground">Type:</span> <span className="font-medium capitalize">{entityType.replace(/_/g, ' ')}</span></p>
                        <p><span className="text-muted-foreground">Authorized:</span> <span className="font-medium">{auth.first_name} {auth.last_name}</span></p>
                        <p><span className="text-muted-foreground">Intents:</span> <span className="font-medium">{intents.join(', ')}</span></p>
                        <p><span className="text-muted-foreground">Source of funds:</span> <span className="font-medium">{sourceFunds.join(', ')}</span></p>
                        {corp && <p><span className="text-muted-foreground">Stakeholders:</span> <span className="font-medium">{stakeholders.length}</span></p>}
                    </div>
                    {state?.message && (
                        <div className={cn('p-4 rounded-md text-sm', state.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800')}>
                            {state.message}
                            {state.errors && <ul className="list-disc pl-5 mt-1">{Object.values(state.errors).flat().map((e, i) => <li key={i}>{e}</li>)}</ul>}
                        </div>
                    )}
                    <Button onClick={handleSubmit} disabled={loading} className="w-full" size="lg">
                        {loading ? 'Submitting…' : 'Submit Verification'}
                    </Button>
                </div>
            )}

            {/* Navigation */}
            {step < steps.length && (
                <div className="flex justify-between pt-2">
                    {step > 1 ? <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button> : <div />}
                    <Button type="button" onClick={() => setStep(step + 1)}
                        disabled={(step === 1 && !canNextBusiness) || (step === 2 && !canNextPeople)}>
                        Next<ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                </div>
            )}
            {step === steps.length && (
                <Button type="button" variant="ghost" onClick={() => setStep(step - 1)} className="w-full"><ArrowLeft className="h-4 w-4 mr-2" />Back to edit</Button>
            )}
        </div>
    )
}

// Shared person form (authorized person; contact uses inline fields above)
function PersonForm({ person, setField, showRole }: {
    person: Person; setField: (k: keyof Person, v: any) => void; showRole?: boolean; showContact?: boolean
}) {
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <Input placeholder="First name" value={person.first_name} onChange={(e) => setField('first_name', e.target.value)} />
                <Input placeholder="Last name" value={person.last_name} onChange={(e) => setField('last_name', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Date of birth</Label>
                    <Input type="date" value={person.date_of_birth || ''} onChange={(e) => setField('date_of_birth', e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Gender</Label>
                    <Select value={person.gender || ''} onValueChange={(v) => setField('gender', v)}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{GENDER.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
                    </Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Nationality</Label>
                    <Input value={person.nationality || ''} onChange={(e) => setField('nationality', e.target.value)} placeholder="Filipino" /></div>
                {showRole && <div className="space-y-1"><Label className="text-xs">Role</Label>
                    <Input value={person.role || ''} onChange={(e) => setField('role', e.target.value)} placeholder="e.g. Director" /></div>}
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">ID type</Label>
                    <Select value={person.id_type || ''} onValueChange={(v) => setField('id_type', v)}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{ID_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select></div>
                <div className="space-y-1"><Label className="text-xs">ID number</Label>
                    <Input value={person.id_number || ''} onChange={(e) => setField('id_number', e.target.value)} /></div>
            </div>
            <Input placeholder="Email" type="email" value={person.email || ''} onChange={(e) => setField('email', e.target.value)} />
            <div className="flex gap-2">
                <Input value={person.mobile_country_code || '+63'} onChange={(e) => setField('mobile_country_code', e.target.value)} className="w-20" />
                <Input placeholder="Mobile number" value={person.mobile_number || ''} onChange={(e) => setField('mobile_number', e.target.value.replace(/[^0-9]/g, ''))} className="flex-1" />
            </div>
            <AddressFields label="Residential address (required)" value={person.address || {}} onChange={(a) => setField('address', a)} />
        </div>
    )
}
