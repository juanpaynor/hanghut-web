'use client'

import { useState, useCallback, useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { submitKYCVerification } from '@/lib/organizer/verification-actions'
import {
    Upload, FileText, Shield, X, User, Phone, Calendar,
    MapPin, Globe, ArrowRight, ArrowLeft, CheckCircle, Briefcase
} from 'lucide-react'
import { cn } from '@/lib/utils'

// --- Step indicator ---
function StepIndicator({ currentStep, steps }: { currentStep: number; steps: string[] }) {
    return (
        <div className="flex items-center justify-center gap-0 mb-8">
            {steps.map((label, i) => {
                const stepNum = i + 1
                const isActive = stepNum === currentStep
                const isCompleted = stepNum < currentStep
                return (
                    <div key={i} className="flex items-center">
                        <div className="flex flex-col items-center">
                            <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300",
                                isCompleted && "bg-green-500 text-white scale-100",
                                isActive && "bg-primary text-primary-foreground scale-110 ring-4 ring-primary/20",
                                !isActive && !isCompleted && "bg-muted text-muted-foreground"
                            )}>
                                {isCompleted ? <CheckCircle className="h-5 w-5" /> : stepNum}
                            </div>
                            <span className={cn(
                                "text-[11px] mt-1.5 font-medium transition-colors whitespace-nowrap",
                                isActive ? "text-primary" : isCompleted ? "text-green-600" : "text-muted-foreground"
                            )}>
                                {label}
                            </span>
                        </div>
                        {i < steps.length - 1 && (
                            <div className={cn(
                                "w-12 sm:w-16 h-0.5 mx-1.5 sm:mx-2 mb-5 transition-colors duration-300",
                                isCompleted ? "bg-green-500" : "bg-muted"
                            )} />
                        )}
                    </div>
                )
            })}
        </div>
    )
}

// --- Drag and drop file upload ---
function FileDropZone({ id, name, label, hint, file, existingUrl, onFileChange, disabled }: {
    id: string; name: string; label: string; hint: string;
    file: File | null; existingUrl?: string | null; onFileChange: (file: File | null) => void; disabled: boolean
}) {
    const [dragging, setDragging] = useState(false)

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragging(false)
        const f = e.dataTransfer.files[0]
        if (f) onFileChange(f)
    }, [onFileChange])

    const hasExisting = existingUrl && !file

    return (
        <div className="space-y-1.5">
            <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
            <div
                className={cn(
                    "relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200",
                    dragging && "border-primary bg-primary/5 scale-[1.02]",
                    file ? "border-green-400 bg-green-500/5" : hasExisting ? "border-blue-400 bg-blue-500/5" : "border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/50",
                    disabled && "opacity-50 cursor-not-allowed"
                )}
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => !disabled && document.getElementById(id)?.click()}
            >
                <input
                    id={id}
                    name={name}
                    type="file"
                    accept="image/*,.pdf"
                    className="sr-only"
                    disabled={disabled}
                    onChange={(e) => onFileChange(e.target.files?.[0] || null)}
                />
                {file ? (
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                            <FileText className="h-5 w-5 text-green-600" />
                        </div>
                        <div className="text-left min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                                {(file.size / 1024).toFixed(0)} KB
                            </p>
                        </div>
                        <button
                            type="button"
                            className="p-1.5 rounded-full hover:bg-destructive/10 transition-colors"
                            onClick={(e) => { e.stopPropagation(); onFileChange(null) }}
                        >
                            <X className="h-4 w-4 text-muted-foreground" />
                        </button>
                    </div>
                ) : hasExisting ? (
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                            <FileText className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="text-left min-w-0 flex-1">
                            <p className="text-sm font-medium">Previously uploaded</p>
                            <p className="text-xs text-muted-foreground">Click to replace with a new file</p>
                        </div>
                        <CheckCircle className="h-5 w-5 text-blue-500 shrink-0" />
                    </div>
                ) : (
                    <div className="py-2">
                        <Upload className="h-6 w-6 mx-auto text-muted-foreground/50 mb-2" />
                        <p className="text-sm text-muted-foreground">
                            <span className="text-primary font-medium">Click to upload</span> or drag & drop
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-0.5">PDF or image, max 10MB</p>
                    </div>
                )}
            </div>
            <p className="text-xs text-muted-foreground/80 pl-1">{hint}</p>
        </div>
    )
}

// --- Submit Button ---
function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <Button disabled={pending} type="submit" className="w-full" size="lg">
            {pending ? 'Submitting...' : 'Submit Verification'}
        </Button>
    )
}

// --- Main KYC Form ---
export function KYCVerificationForm({ 
    userEmail,
    existingData 
}: { 
    userEmail?: string
    existingData?: {
        business_type?: string
        representative_name?: string
        contact_number?: string
        nationality?: string
        place_of_birth?: string
        street_line1?: string
        street_line2?: string
        city?: string
        province_state?: string
        postal_code?: string
        tax_id?: string
        registration_number?: string
        id_document_url?: string | null
        business_document_url?: string | null
        bir_2303_url?: string | null
        articles_of_incorporation_url?: string | null
        secretary_certificate_url?: string | null
        latest_gis_url?: string | null
    }
}) {
    const [state, action] = useActionState(submitKYCVerification, undefined)
    const [step, setStep] = useState(1)

    // Step 1: Representative
    const [businessType, setBusinessType] = useState(existingData?.business_type || '')
    const [representativeName, setRepresentativeName] = useState(existingData?.representative_name || '')
    const [countryCode, setCountryCode] = useState('+63')
    const [phoneNumber, setPhoneNumber] = useState(existingData?.contact_number?.replace(/^\+\d{1,3}/, '') || '')
    const [birthdate, setBirthdate] = useState('')
    const [sex, setSex] = useState('')
    const [nationality, setNationality] = useState(existingData?.nationality || 'Filipino')
    const [placeOfBirth, setPlaceOfBirth] = useState(existingData?.place_of_birth || '')

    // Step 2: Address
    const [streetLine1, setStreetLine1] = useState(existingData?.street_line1 || '')
    const [streetLine2, setStreetLine2] = useState(existingData?.street_line2 || '')
    const [city, setCity] = useState(existingData?.city || '')
    const [provinceState, setProvinceState] = useState(existingData?.province_state || '')
    const [postalCode, setPostalCode] = useState(existingData?.postal_code || '')

    // Step 3: Documents
    const [taxId, setTaxId] = useState(existingData?.tax_id || '')
    const [regNumber, setRegNumber] = useState(existingData?.registration_number || '')
    const [idDoc, setIdDoc] = useState<File | null>(null)
    const [bizDoc, setBizDoc] = useState<File | null>(null)
    const [birDoc, setBirDoc] = useState<File | null>(null)
    const [articlesDoc, setArticlesDoc] = useState<File | null>(null)
    const [secretaryCertDoc, setSecretaryCertDoc] = useState<File | null>(null)
    const [gisDoc, setGisDoc] = useState<File | null>(null)

    const steps = ['Representative', 'Address', 'Documents', 'Review']
    const isCorporation = businessType === 'corporation' || businessType === 'partnership'

    const isStep1Valid = businessType && representativeName.trim() && phoneNumber.trim() &&
        birthdate && sex && nationality.trim() && placeOfBirth.trim()

    const hasAnyDocs = !!idDoc || !!bizDoc || !!birDoc || !!articlesDoc || !!secretaryCertDoc || !!gisDoc
    const hasExistingDocs = !!(existingData?.id_document_url || existingData?.business_document_url || existingData?.bir_2303_url)

    return (
        <form action={action} className="space-y-6">
            {/* Hidden fields for server action */}
            <input type="hidden" name="businessType" value={businessType} />
            <input type="hidden" name="representativeName" value={representativeName} />
            <input type="hidden" name="phoneNumber" value={`${countryCode}${phoneNumber}`} />
            <input type="hidden" name="birthdate" value={birthdate} />
            <input type="hidden" name="sex" value={sex} />
            <input type="hidden" name="nationality" value={nationality} />
            <input type="hidden" name="placeOfBirth" value={placeOfBirth} />
            <input type="hidden" name="streetLine1" value={streetLine1} />
            <input type="hidden" name="streetLine2" value={streetLine2} />
            <input type="hidden" name="city" value={city} />
            <input type="hidden" name="provinceState" value={provinceState} />
            <input type="hidden" name="postalCode" value={postalCode} />
            <input type="hidden" name="taxId" value={taxId} />
            <input type="hidden" name="registrationNumber" value={regNumber} />

            <StepIndicator currentStep={step} steps={steps} />

            {/* ============ STEP 1: Representative ============ */}
            {step === 1 && (
                <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div>
                        <h2 className="text-xl font-bold">Representative Details</h2>
                        <p className="text-sm text-muted-foreground mt-1">Business info & authorized representative</p>
                    </div>

                    <div className="space-y-2">
                        <Label>Business Type</Label>
                        <Select value={businessType} onValueChange={setBusinessType}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select business type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="sole_proprietorship">Sole Proprietorship</SelectItem>
                                <SelectItem value="corporation">Corporation</SelectItem>
                                <SelectItem value="partnership">Partnership</SelectItem>
                            </SelectContent>
                        </Select>
                        {state?.errors?.businessType && (
                            <p className="text-sm text-red-500">{state.errors.businessType}</p>
                        )}
                    </div>

                    <div className="border-t pt-4 space-y-4">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Authorized Representative</h3>

                        <div className="space-y-2">
                            <Label htmlFor="representativeName">Full Legal Name</Label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="representativeName"
                                    value={representativeName}
                                    onChange={(e) => setRepresentativeName(e.target.value)}
                                    placeholder="Juan Dela Cruz"
                                    className="pl-10"
                                    required
                                />
                            </div>
                            {state?.errors?.representativeName && (
                                <p className="text-sm text-red-500">{state.errors.representativeName}</p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="birthdate">Date of Birth</Label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="birthdate"
                                        type="date"
                                        value={birthdate}
                                        onChange={(e) => setBirthdate(e.target.value)}
                                        className="pl-10"
                                        required
                                    />
                                </div>
                                {state?.errors?.birthdate && (
                                    <p className="text-sm text-red-500">{state.errors.birthdate}</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label>Sex</Label>
                                <Select value={sex} onValueChange={setSex}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="male">Male</SelectItem>
                                        <SelectItem value="female">Female</SelectItem>
                                    </SelectContent>
                                </Select>
                                {state?.errors?.sex && (
                                    <p className="text-sm text-red-500">{state.errors.sex}</p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="nationality">Nationality</Label>
                                <div className="relative">
                                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="nationality"
                                        value={nationality}
                                        onChange={(e) => setNationality(e.target.value)}
                                        placeholder="Filipino"
                                        className="pl-10"
                                        required
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="placeOfBirth">Place of Birth</Label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="placeOfBirth"
                                        value={placeOfBirth}
                                        onChange={(e) => setPlaceOfBirth(e.target.value)}
                                        placeholder="Manila, Philippines"
                                        className="pl-10"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="phoneNumber">Phone Number</Label>
                            <div className="flex gap-2">
                                <Select value={countryCode} onValueChange={setCountryCode}>
                                    <SelectTrigger className="w-[100px] shrink-0">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="+63">🇵🇭 +63</SelectItem>
                                        <SelectItem value="+1">🇺🇸 +1</SelectItem>
                                        <SelectItem value="+44">🇬🇧 +44</SelectItem>
                                        <SelectItem value="+65">🇸🇬 +65</SelectItem>
                                        <SelectItem value="+81">🇯🇵 +81</SelectItem>
                                        <SelectItem value="+82">🇰🇷 +82</SelectItem>
                                        <SelectItem value="+61">🇦🇺 +61</SelectItem>
                                        <SelectItem value="+852">🇭🇰 +852</SelectItem>
                                        <SelectItem value="+60">🇲🇾 +60</SelectItem>
                                        <SelectItem value="+66">🇹🇭 +66</SelectItem>
                                    </SelectContent>
                                </Select>
                                <div className="relative flex-1">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="phoneNumber"
                                        type="tel"
                                        value={phoneNumber}
                                        onChange={(e) => setPhoneNumber(e.target.value.replace(/[^0-9]/g, ''))}
                                        placeholder="9171234567"
                                        className="pl-10"
                                        required
                                    />
                                </div>
                            </div>
                            {state?.errors?.phoneNumber && (
                                <p className="text-sm text-red-500">{state.errors.phoneNumber}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ============ STEP 2: Business Address ============ */}
            {step === 2 && (
                <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div>
                        <h2 className="text-xl font-bold">Business Address</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Physical address of your business for KYC verification
                        </p>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3.5 flex items-start gap-3">
                        <MapPin className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-medium text-blue-700 dark:text-blue-400">Optional for now</p>
                            <p className="text-xs text-blue-600/80 dark:text-blue-400/70 mt-0.5">
                                You can skip this and add your address later from settings.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="streetLine1">Street Address</Label>
                        <Input
                            id="streetLine1"
                            value={streetLine1}
                            onChange={(e) => setStreetLine1(e.target.value)}
                            placeholder="123 Ayala Avenue, Makati"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="streetLine2">Unit / Floor / Building (Optional)</Label>
                        <Input
                            id="streetLine2"
                            value={streetLine2}
                            onChange={(e) => setStreetLine2(e.target.value)}
                            placeholder="Unit 401, Tower 1"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="city">City / Municipality</Label>
                            <Input
                                id="city"
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                placeholder="Makati City"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="provinceState">Province / Region</Label>
                            <Input
                                id="provinceState"
                                value={provinceState}
                                onChange={(e) => setProvinceState(e.target.value)}
                                placeholder="Metro Manila"
                            />
                        </div>
                    </div>

                    <div className="w-1/2">
                        <div className="space-y-2">
                            <Label htmlFor="postalCode">Postal Code</Label>
                            <Input
                                id="postalCode"
                                value={postalCode}
                                onChange={(e) => setPostalCode(e.target.value.replace(/[^0-9]/g, ''))}
                                placeholder="1200"
                                maxLength={6}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* ============ STEP 3: Documents ============ */}
            {step === 3 && (
                <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div>
                        <h2 className="text-xl font-bold">Verification Documents</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Upload documents to enable GCash & credit card payments
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="taxId">TIN (Tax ID Number)</Label>
                            <Input
                                id="taxId"
                                value={taxId}
                                onChange={(e) => setTaxId(e.target.value)}
                                placeholder="000-000-000-000"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="regNumber">DTI/SEC Reg. No.</Label>
                            <Input
                                id="regNumber"
                                value={regNumber}
                                onChange={(e) => setRegNumber(e.target.value)}
                                placeholder="Registration number"
                            />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Required Documents</h3>
                        <FileDropZone
                            id="idDocument" name="idDocument"
                            label="Government-Issued ID"
                            hint="Valid government ID (passport, driver's license, etc.)"
                            file={idDoc} existingUrl={existingData?.id_document_url} onFileChange={setIdDoc} disabled={false}
                        />
                        <FileDropZone
                            id="businessDocument" name="businessDocument"
                            label="Business Registration"
                            hint={businessType === 'sole_proprietorship' ? 'DTI Certificate of Registration' : 'SEC Certificate of Registration'}
                            file={bizDoc} existingUrl={existingData?.business_document_url} onFileChange={setBizDoc} disabled={false}
                        />
                        <FileDropZone
                            id="bir2303" name="bir2303"
                            label="BIR Form 2303"
                            hint="Certificate of Registration from the Bureau of Internal Revenue"
                            file={birDoc} existingUrl={existingData?.bir_2303_url} onFileChange={setBirDoc} disabled={false}
                        />
                    </div>

                    {isCorporation && (
                        <div className="space-y-3 border-t pt-4">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                Additional for {businessType === 'corporation' ? 'Corporations' : 'Partnerships'}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                These additional documents are required by Xendit for {businessType === 'corporation' ? 'corporations' : 'partnerships'}.
                            </p>
                            <FileDropZone
                                id="articlesOfIncorporation" name="articlesOfIncorporation"
                                label="Articles of Incorporation"
                                hint="Notarized copy of your Articles of Incorporation"
                                file={articlesDoc} existingUrl={existingData?.articles_of_incorporation_url} onFileChange={setArticlesDoc} disabled={false}
                            />
                            <FileDropZone
                                id="secretaryCertificate" name="secretaryCertificate"
                                label="Notarized Secretary's Certificate"
                                hint="Board resolution authorizing the representative to transact"
                                file={secretaryCertDoc} existingUrl={existingData?.secretary_certificate_url} onFileChange={setSecretaryCertDoc} disabled={false}
                            />
                            <FileDropZone
                                id="latestGIS" name="latestGIS"
                                label="Latest GIS (General Information Sheet)"
                                hint="Most recent GIS filed with SEC"
                                file={gisDoc} existingUrl={existingData?.latest_gis_url} onFileChange={setGisDoc} disabled={false}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* ============ STEP 4: Review ============ */}
            {step === 4 && (
                <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div>
                        <h2 className="text-xl font-bold">Review & Submit</h2>
                        <p className="text-sm text-muted-foreground mt-1">Make sure everything looks good</p>
                    </div>

                    {/* Representative Summary */}
                    <div className="rounded-xl border p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <Briefcase className="h-4 w-4 text-primary" />
                            Representative
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                            <div>
                                <p className="text-muted-foreground text-xs">Business Type</p>
                                <p className="font-medium capitalize">{businessType.replace('_', ' ')}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground text-xs">Name</p>
                                <p className="font-medium">{representativeName}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground text-xs">Phone</p>
                                <p className="font-medium">{countryCode}{phoneNumber}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground text-xs">Birthdate</p>
                                <p className="font-medium">{birthdate}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground text-xs">Sex</p>
                                <p className="font-medium capitalize">{sex}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground text-xs">Nationality</p>
                                <p className="font-medium">{nationality}</p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-muted-foreground text-xs">Place of Birth</p>
                                <p className="font-medium">{placeOfBirth}</p>
                            </div>
                        </div>
                    </div>

                    {/* Address Summary */}
                    <div className="rounded-xl border p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <MapPin className="h-4 w-4 text-primary" />
                            Business Address
                        </div>
                        {streetLine1 || city ? (
                            <div className="text-sm">
                                <p className="font-medium">
                                    {[streetLine1, streetLine2].filter(Boolean).join(', ')}
                                </p>
                                <p className="text-muted-foreground">
                                    {[city, provinceState, postalCode].filter(Boolean).join(', ')}
                                </p>
                            </div>
                        ) : (
                            <p className="text-sm text-amber-600 flex items-center gap-1.5">
                                Not provided — can be added later
                            </p>
                        )}
                    </div>

                    {/* Documents Summary */}
                    <div className="rounded-xl border p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <Shield className="h-4 w-4 text-primary" />
                            Verification Documents
                        </div>
                        {hasAnyDocs || hasExistingDocs || taxId || regNumber ? (
                            <div className="space-y-1.5 text-sm">
                                {taxId && (
                                    <div className="flex items-center gap-2">
                                        <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                        <span>TIN: {taxId}</span>
                                    </div>
                                )}
                                {regNumber && (
                                    <div className="flex items-center gap-2">
                                        <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                        <span>Reg: {regNumber}</span>
                                    </div>
                                )}
                                {[
                                    { file: idDoc, existing: existingData?.id_document_url, label: 'Government ID' },
                                    { file: bizDoc, existing: existingData?.business_document_url, label: 'Business Registration' },
                                    { file: birDoc, existing: existingData?.bir_2303_url, label: 'BIR 2303' },
                                    { file: articlesDoc, existing: existingData?.articles_of_incorporation_url, label: 'Articles of Incorporation' },
                                    { file: secretaryCertDoc, existing: existingData?.secretary_certificate_url, label: "Secretary's Certificate" },
                                    { file: gisDoc, existing: existingData?.latest_gis_url, label: 'Latest GIS' },
                                ].filter(d => d.file || d.existing).map((d) => (
                                    <div key={d.label} className="flex items-center gap-2">
                                        <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                        <span className="truncate">
                                            {d.label}: {d.file ? d.file.name : 'Previously uploaded'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-amber-600 flex items-center gap-1.5">
                                No documents uploaded — can be added later
                            </p>
                        )}
                    </div>

                    {state?.message && (
                        <div className={`p-4 rounded-md ${state.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                            {state.message}
                        </div>
                    )}

                    <SubmitButton />
                </div>
            )}

            {/* Navigation Buttons */}
            {step < 4 && (
                <div className="flex justify-between pt-2">
                    {step > 1 ? (
                        <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back
                        </Button>
                    ) : <div />}
                    <Button
                        type="button"
                        onClick={() => setStep(step + 1)}
                        disabled={step === 1 && !isStep1Valid}
                    >
                        Next
                        <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                </div>
            )}
            {step === 4 && step > 1 && (
                <Button type="button" variant="ghost" onClick={() => setStep(step - 1)} className="w-full">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Edit
                </Button>
            )}
        </form>
    )
}
