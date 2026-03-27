'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    Building, Mail, Lock, ArrowRight, ArrowLeft, CheckCircle,
    Upload, FileText, Shield, Briefcase, X, Eye, EyeOff,
    Sparkles, User, Phone, Calendar, MapPin, Globe
} from 'lucide-react'
import Link from 'next/link'
import { registerPartner } from '@/lib/organizer/auth-actions'
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
function FileDropZone({ id, name, label, hint, file, onFileChange, disabled }: {
    id: string; name: string; label: string; hint: string;
    file: File | null; onFileChange: (file: File | null) => void; disabled: boolean
}) {
    const [dragging, setDragging] = useState(false)

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragging(false)
        const f = e.dataTransfer.files[0]
        if (f) onFileChange(f)
    }, [onFileChange])

    return (
        <div className="space-y-1.5">
            <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
            <div
                className={cn(
                    "relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200",
                    dragging && "border-primary bg-primary/5 scale-[1.02]",
                    file ? "border-green-400 bg-green-500/5" : "border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/50",
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

// --- Main Registration Page ---
export default function OrganizerRegisterPage() {
    const router = useRouter()
    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)
    const [showPassword, setShowPassword] = useState(false)

    // Step 1: Account & Representative
    const [businessName, setBusinessName] = useState('')
    const [businessType, setBusinessType] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [representativeName, setRepresentativeName] = useState('')
    const [countryCode, setCountryCode] = useState('+63')
    const [phoneNumber, setPhoneNumber] = useState('')
    const [birthdate, setBirthdate] = useState('')
    const [sex, setSex] = useState('')
    const [nationality, setNationality] = useState('Filipino')
    const [placeOfBirth, setPlaceOfBirth] = useState('')

    // Step 2: Address
    const [streetLine1, setStreetLine1] = useState('')
    const [streetLine2, setStreetLine2] = useState('')
    const [city, setCity] = useState('')
    const [provinceState, setProvinceState] = useState('')
    const [postalCode, setPostalCode] = useState('')

    // Step 3: Documents
    const [taxId, setTaxId] = useState('')
    const [regNumber, setRegNumber] = useState('')
    const [idDoc, setIdDoc] = useState<File | null>(null)
    const [bizDoc, setBizDoc] = useState<File | null>(null)
    const [birDoc, setBirDoc] = useState<File | null>(null)
    // Corporation-specific
    const [articlesDoc, setArticlesDoc] = useState<File | null>(null)
    const [secretaryCertDoc, setSecretaryCertDoc] = useState<File | null>(null)
    const [gisDoc, setGisDoc] = useState<File | null>(null)

    const steps = ['Account', 'Address', 'Documents', 'Review']
    const isCorporation = businessType === 'corporation' || businessType === 'partnership'

    // Validation
    const isStep1Valid = businessName.trim() && businessType && email.trim() &&
        password.length >= 6 && password === confirmPassword &&
        representativeName.trim() && phoneNumber.trim() && birthdate && sex &&
        nationality.trim() && placeOfBirth.trim()

    const hasAnyDocs = !!idDoc || !!bizDoc || !!birDoc || !!articlesDoc || !!secretaryCertDoc || !!gisDoc

    function handleNext() {
        setError('')
        if (step === 1) {
            if (password !== confirmPassword) {
                setError('Passwords do not match')
                return
            }
            if (password.length < 6) {
                setError('Password must be at least 6 characters')
                return
            }
            setStep(2)
        } else if (step === 2) {
            setStep(3)
        } else if (step === 3) {
            setStep(4)
        }
    }

    async function handleSubmit() {
        setLoading(true)
        setError('')

        const formData = new FormData()
        formData.append('businessName', businessName)
        formData.append('businessType', businessType)
        formData.append('email', email)
        formData.append('password', password)
        formData.append('confirmPassword', confirmPassword)

        // Representative
        formData.append('representativeName', representativeName)
        formData.append('phoneNumber', `${countryCode}${phoneNumber}`)
        formData.append('birthdate', birthdate)
        formData.append('sex', sex)
        formData.append('nationality', nationality)
        formData.append('placeOfBirth', placeOfBirth)

        // Address
        if (streetLine1) formData.append('streetLine1', streetLine1)
        if (streetLine2) formData.append('streetLine2', streetLine2)
        if (city) formData.append('city', city)
        if (provinceState) formData.append('provinceState', provinceState)
        if (postalCode) formData.append('postalCode', postalCode)

        // Optional KYC fields
        if (taxId) formData.append('taxId', taxId)
        if (regNumber) formData.append('registrationNumber', regNumber)
        if (idDoc) formData.append('idDocument', idDoc)
        if (bizDoc) formData.append('businessDocument', bizDoc)
        if (birDoc) formData.append('bir2303', birDoc)
        if (articlesDoc) formData.append('articlesOfIncorporation', articlesDoc)
        if (secretaryCertDoc) formData.append('secretaryCertificate', secretaryCertDoc)
        if (gisDoc) formData.append('latestGIS', gisDoc)

        const result = await registerPartner(formData)

        if (result.error) {
            setError(result.error)
            setLoading(false)
        } else {
            setSuccess(true)
            setLoading(false)
            setTimeout(() => router.push('/organizer/login'), 4000)
        }
    }

    // --- Success State ---
    if (success) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <Card className="max-w-md w-full p-10 text-center space-y-6 shadow-2xl border-green-200/50">
                    <div className="mx-auto w-20 h-20 bg-green-50 rounded-full flex items-center justify-center animate-in zoom-in duration-500">
                        <CheckCircle className="h-10 w-10 text-green-500" />
                    </div>
                    <div className="space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
                        <h2 className="text-2xl font-bold">You&apos;re All Set!</h2>
                        <p className="text-muted-foreground">
                            Your partner application is now <strong className="text-foreground">pending approval</strong>.
                        </p>
                    </div>
                    <div className="bg-muted/50 rounded-xl p-4 text-sm text-muted-foreground animate-in fade-in duration-500 delay-300">
                        <p>We&apos;ll review your application shortly. {hasAnyDocs ? 'Your documents have been uploaded for verification.' : 'You can upload verification documents later from your dashboard.'}</p>
                    </div>
                    <Button asChild size="lg" className="w-full animate-in fade-in duration-500 delay-500">
                        <Link href="/organizer/login">Sign In to Dashboard</Link>
                    </Button>
                </Card>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4 py-12">
            <div className="w-full max-w-lg space-y-6">
                {/* Logo */}
                <div className="text-center">
                    <Link href="/" className="inline-block bg-primary px-6 py-3 rounded transform -rotate-1 shadow-lg mb-3 hover:scale-105 transition-transform">
                        <h1 className="font-headline font-bold text-3xl text-primary-foreground">
                            HANGHUT
                        </h1>
                    </Link>
                    <div className="flex items-center justify-center gap-2 text-muted-foreground mt-3">
                        <Briefcase className="h-4 w-4" />
                        <p className="text-sm font-medium">Become a Partner</p>
                    </div>
                </div>

                {/* Step Indicator */}
                <StepIndicator currentStep={step} steps={steps} />

                {/* Form Card */}
                <Card className="p-8 shadow-xl overflow-hidden">
                    {/* ============ STEP 1: Account & Representative ============ */}
                    {step === 1 && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div>
                                <h2 className="text-xl font-bold">Create your account</h2>
                                <p className="text-sm text-muted-foreground mt-1">Business info & authorized representative details</p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="businessName">Business / Organization Name</Label>
                                <div className="relative">
                                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="businessName"
                                        value={businessName}
                                        onChange={(e) => setBusinessName(e.target.value)}
                                        placeholder="Acme Events Inc."
                                        className="pl-10"
                                        required
                                    />
                                </div>
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
                            </div>

                            {/* Representative Section */}
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
                                </div>
                            </div>

                            {/* Login Section */}
                            <div className="border-t pt-4 space-y-4">
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Login Credentials</h3>

                                <div className="space-y-2">
                                    <Label htmlFor="email">Work Email</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="email"
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="events@company.com"
                                            className="pl-10"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <Label htmlFor="password">Password</Label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                id="password"
                                                type={showPassword ? 'text' : 'password'}
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="••••••••"
                                                className="pl-10 pr-10"
                                                required
                                            />
                                            <button
                                                type="button"
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                                onClick={() => setShowPassword(!showPassword)}
                                            >
                                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="confirmPassword">Confirm</Label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                id="confirmPassword"
                                                type={showPassword ? 'text' : 'password'}
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                placeholder="••••••••"
                                                className="pl-10"
                                                required
                                            />
                                        </div>
                                        {confirmPassword && password !== confirmPassword && (
                                            <p className="text-xs text-destructive">Passwords don&apos;t match</p>
                                        )}
                                    </div>
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

                    {/* ============ STEP 3: Verification Documents ============ */}
                    {step === 3 && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div>
                                <h2 className="text-xl font-bold">Verification Documents</h2>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Upload documents to enable GCash & credit card payments
                                </p>
                            </div>

                            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3.5 flex items-start gap-3">
                                <Shield className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-blue-700 dark:text-blue-400">Optional for now</p>
                                    <p className="text-xs text-blue-600/80 dark:text-blue-400/70 mt-0.5">
                                        You can skip this and upload documents later from your dashboard.
                                    </p>
                                </div>
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

                            {/* Common Documents */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Required Documents</h3>
                                <FileDropZone
                                    id="idDocument" name="idDocument"
                                    label="Government-Issued ID"
                                    hint="Valid government ID (passport, driver's license, etc.)"
                                    file={idDoc} onFileChange={setIdDoc} disabled={loading}
                                />
                                <FileDropZone
                                    id="businessDocument" name="businessDocument"
                                    label="Business Registration"
                                    hint={businessType === 'sole_proprietorship' ? 'DTI Certificate of Registration' : 'SEC Certificate of Registration'}
                                    file={bizDoc} onFileChange={setBizDoc} disabled={loading}
                                />
                                <FileDropZone
                                    id="bir2303" name="bir2303"
                                    label="BIR Form 2303"
                                    hint="Certificate of Registration from the Bureau of Internal Revenue"
                                    file={birDoc} onFileChange={setBirDoc} disabled={loading}
                                />
                            </div>

                            {/* Corporation-specific Documents */}
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
                                        file={articlesDoc} onFileChange={setArticlesDoc} disabled={loading}
                                    />
                                    <FileDropZone
                                        id="secretaryCertificate" name="secretaryCertificate"
                                        label="Notarized Secretary's Certificate"
                                        hint="Board resolution authorizing the representative to transact"
                                        file={secretaryCertDoc} onFileChange={setSecretaryCertDoc} disabled={loading}
                                    />
                                    <FileDropZone
                                        id="latestGIS" name="latestGIS"
                                        label="Latest GIS (General Information Sheet)"
                                        hint="Most recent GIS filed with SEC"
                                        file={gisDoc} onFileChange={setGisDoc} disabled={loading}
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

                            {/* Account Summary */}
                            <div className="rounded-xl border p-4 space-y-3">
                                <div className="flex items-center gap-2 text-sm font-semibold">
                                    <Briefcase className="h-4 w-4 text-primary" />
                                    Account & Representative
                                </div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                    <div>
                                        <p className="text-muted-foreground text-xs">Business Name</p>
                                        <p className="font-medium">{businessName}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground text-xs">Type</p>
                                        <p className="font-medium capitalize">{businessType.replace('_', ' ')}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground text-xs">Representative</p>
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
                                    <div>
                                        <p className="text-muted-foreground text-xs">Place of Birth</p>
                                        <p className="font-medium">{placeOfBirth}</p>
                                    </div>
                                    <div className="col-span-2">
                                        <p className="text-muted-foreground text-xs">Email</p>
                                        <p className="font-medium">{email}</p>
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
                                        <Sparkles className="h-3.5 w-3.5" />
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
                                {hasAnyDocs || taxId || regNumber ? (
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
                                            { file: idDoc, label: 'Government ID' },
                                            { file: bizDoc, label: 'Business Registration' },
                                            { file: birDoc, label: 'BIR 2303' },
                                            { file: articlesDoc, label: 'Articles of Incorporation' },
                                            { file: secretaryCertDoc, label: "Secretary's Certificate" },
                                            { file: gisDoc, label: 'Latest GIS' },
                                        ].filter(d => d.file).map((d) => (
                                            <div key={d.label} className="flex items-center gap-2">
                                                <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                                <span className="truncate">{d.label}: {d.file!.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-amber-600 flex items-center gap-1.5">
                                        <Sparkles className="h-3.5 w-3.5" />
                                        No documents uploaded — can be added later
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-xl">
                            <p className="text-sm text-destructive">{error}</p>
                        </div>
                    )}

                    {/* Navigation */}
                    <div className="flex gap-3 mt-6">
                        {step > 1 && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => { setStep(step - 1); setError('') }}
                                disabled={loading}
                                className="flex-1"
                            >
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Back
                            </Button>
                        )}

                        {step < 4 ? (
                            <Button
                                type="button"
                                onClick={handleNext}
                                disabled={step === 1 && !isStep1Valid}
                                className="flex-1 bg-primary hover:bg-primary/90"
                                size="lg"
                            >
                                {step === 2 ? (streetLine1 ? 'Continue' : 'Skip') : step === 3 ? (hasAnyDocs ? 'Review' : 'Skip & Review') : 'Continue'}
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                onClick={handleSubmit}
                                disabled={loading}
                                className="flex-1 bg-primary hover:bg-primary/90"
                                size="lg"
                            >
                                {loading ? 'Creating Account...' : (
                                    <>
                                        Submit Application
                                        <Sparkles className="ml-2 h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                </Card>

                {/* Footer */}
                <div className="text-center">
                    <p className="text-sm text-muted-foreground">
                        Already have an account?{' '}
                        <Link href="/organizer/login" className="text-primary hover:underline font-medium">
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    )
}
