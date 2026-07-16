'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { RichTextEditor } from '@/components/organizer/marketing/rich-text-editor'
import { Card } from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Calendar, MapPin, Upload, X, Loader2, DollarSign, FileText, Armchair, Plus, Trash2, Check, Copy, ExternalLink, Code2, Send } from 'lucide-react'
import { createEvent, updateEvent } from '@/lib/organizer/event-actions'
import { GooglePlacesAutocomplete } from '@/components/organizer/google-places-autocomplete'
import { useToast } from '@/hooks/use-toast'
import { TicketTiersManager } from '@/components/organizer/ticket-tiers-manager'
import { SubscriberDiscountsSection, type SubscriptionTierBasic, type ExistingDiscount } from '@/components/organizer/subscriber-discounts-section'
import { createClient } from '@/lib/supabase/client'

// New events pick a Category from the server lookup (event_categories). We still derive
// and write the legacy event_type enum during the transition so the old app's map +
// Discover keep working until both platforms cut over to `category`.
const CATEGORY_TO_EVENT_TYPE: Record<string, string> = {
    live_music: 'concert', performing_arts: 'art', arts_culture: 'art',
    food_drink: 'food', workshops_classes: 'workshop', wellness: 'other',
    fitness_sports: 'sports', talks_discussions: 'conference', business_networking: 'conference',
    tech: 'conference', games_social: 'social', family_kids: 'social', community: 'social',
    outdoors_adventure: 'sports', markets_popups: 'other', nightlife: 'nightlife', other: 'other',
}

interface EventFormData {
    title: string
    description: string
    description_html: string
    event_type: string
    category: string
    venue_name: string
    address: string
    city: string
    latitude: number | null
    longitude: number | null
    start_datetime: string
    end_datetime: string
    ticket_price: string
    capacity: string
    sales_end_datetime: string
    cover_image: File | null
    additional_images: File[]
    custom_tos: string
    status: 'draft' | 'active' | 'paused' | 'cancelled' | 'hidden'
    seating_type: 'general_admission' | 'assigned_seating'
    max_seats_per_order: string
    ticketing_type: 'internal' | 'external'
    external_ticket_url: string
    external_provider_name: string
    require_approval: boolean
    invite_only: boolean
    rsvp_enabled: boolean
    rsvp_button_label: string
    hide_venue_until_registered: boolean
    approval_email_subject: string
    approval_email_body: string
    rejection_email_subject: string
    rejection_email_body: string
}

interface EventFormProps {
    partnerId: string
    commissionRate: number
    initialData?: any // Can be typed more strictly if needed
    eventId?: string
    passFeesToCustomer: boolean
    fixedFeePerTicket: number
    subscriptionTiers?: SubscriptionTierBasic[]
    existingDiscounts?: ExistingDiscount[]
}

export function EventForm({
    partnerId,
    commissionRate,
    initialData,
    eventId,
    passFeesToCustomer,
    fixedFeePerTicket,
    subscriptionTiers = [],
    existingDiscounts = [],
}: EventFormProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [isLoading, setIsLoading] = useState(false)
    const [coverPreview, setCoverPreview] = useState<string | null>(initialData?.cover_image_url || null)

    // For existing events, we might have existing images URLs
    const [existingImages, setExistingImages] = useState<string[]>(initialData?.images || [])
    const [additionalPreviews, setAdditionalPreviews] = useState<string[]>([])
    const [errors, setErrors] = useState<Record<string, string>>({})

    // Categories render from the server lookup so web + app never drift.
    const [categories, setCategories] = useState<{ key: string; label: string; emoji: string | null }[]>([])
    useEffect(() => {
        createClient()
            .from('event_categories')
            .select('key,label,emoji')
            .eq('is_active', true)
            .order('sort_order')
            .then(({ data }) => { if (data) setCategories(data) })
    }, [])

    const isEditing = !!eventId
    const [step, setStep] = useState<1 | 2>(1)
    const [createdEventId, setCreatedEventId] = useState<string | null>(null)
    // Post-publish success screen (create only).
    const [published, setPublished] = useState<{ id: string; status: string } | null>(null)
    const [linkCopied, setLinkCopied] = useState(false)

    const [formData, setFormData] = useState<EventFormData>({
        title: initialData?.title || '',
        description: initialData?.description || '',
        // Prefer stored rich HTML; fall back to existing plain text so legacy
        // events keep their description when edited.
        description_html: initialData?.description_html || initialData?.description || '',
        event_type: initialData?.event_type || 'concert',
        category: initialData?.category || '',
        venue_name: initialData?.venue_name || '',
        address: initialData?.address || '',
        city: initialData?.city || '',
        latitude: initialData?.latitude || null,
        longitude: initialData?.longitude || null,
        start_datetime: initialData?.start_datetime ? new Date(initialData.start_datetime).toISOString().slice(0, 16) : '',
        end_datetime: initialData?.end_datetime ? new Date(initialData.end_datetime).toISOString().slice(0, 16) : '',
        ticket_price: initialData?.ticket_price?.toString() || '0',
        capacity: initialData?.capacity?.toString() || '',
        sales_end_datetime: initialData?.sales_end_datetime ? new Date(initialData.sales_end_datetime).toISOString().slice(0, 16) : '',
        cover_image: null,
        additional_images: [],
        custom_tos: initialData?.custom_tos || '',
        status: initialData?.status || 'draft',
        seating_type: initialData?.seating_type || 'general_admission',
        max_seats_per_order: initialData?.max_seats_per_order?.toString() || '10',
        ticketing_type: initialData?.is_external ? 'external' : 'internal',
        external_ticket_url: initialData?.external_ticket_url || '',
        external_provider_name: initialData?.external_provider_name || '',
        require_approval: initialData?.require_approval || false,
        invite_only: initialData?.invite_only || false,
        rsvp_enabled: initialData?.rsvp_enabled || false,
        rsvp_button_label: initialData?.rsvp_button_label || '',
        hide_venue_until_registered: initialData?.hide_venue_until_registered || false,
        approval_email_subject: initialData?.approval_email_subject || '',
        approval_email_body: initialData?.approval_email_body || '',
        rejection_email_subject: initialData?.rejection_email_subject || '',
        rejection_email_body: initialData?.rejection_email_body || '',
    })

    // Draft autosave (new events only): protect a half-filled form against tab
    // switches / accidental reloads. Files can't be serialized, so we persist
    // the text fields only; the cover is re-picked. Cleared on successful save.
    const AUTOSAVE_KEY = `hh:event-draft:${partnerId}`
    const hydratedRef = useRef(false)
    const [descKey, setDescKey] = useState(0) // remounts the uncontrolled description editor after restore

    // Ticket tiers built inline in the wizard (create only). Persisted with the
    // draft and turned into ticket_tiers rows on publish (createEvent). Existing
    // events manage tiers on their dashboard, so editing keeps the single-price fields.
    type TierDraft = { id: string; name: string; price: string; quantity: string }
    const newTierId = () => Math.random().toString(36).slice(2)
    const [tiers, setTiers] = useState<TierDraft[]>([{ id: newTierId(), name: 'General Admission', price: '0', quantity: '' }])
    const addTier = () => setTiers(t => [...t, { id: newTierId(), name: '', price: '0', quantity: '' }])
    const updateTier = (id: string, field: keyof TierDraft, value: string) =>
        setTiers(t => t.map(x => (x.id === id ? { ...x, [field]: value } : x)))
    const removeTier = (id: string) => setTiers(t => (t.length > 1 ? t.filter(x => x.id !== id) : t))

    useEffect(() => {
        if (isEditing) { hydratedRef.current = true; return }
        try {
            const raw = localStorage.getItem(AUTOSAVE_KEY)
            if (raw) {
                const { __tiers, ...saved } = JSON.parse(raw)
                setFormData(prev => ({ ...prev, ...saved, cover_image: null, additional_images: [] }))
                if (saved.description_html) setDescKey(k => k + 1)
                if (Array.isArray(__tiers) && __tiers.length) setTiers(__tiers)
            }
        } catch { /* ignore corrupt autosave */ }
        hydratedRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (isEditing || !hydratedRef.current) return
        try {
            const { cover_image, additional_images, ...rest } = formData
            void cover_image; void additional_images
            localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ ...rest, __tiers: tiers }))
        } catch { /* storage unavailable — non-fatal */ }
    }, [formData, tiers, isEditing])

    // Calculate pricing preview
    const ticketPrice = parseFloat(formData.ticket_price) || 0
    const platformFee = ticketPrice * commissionRate
    const organizerPayout = ticketPrice - platformFee
    const priceLabel = ticketPrice === 0 ? 'Free' : `From ₱${ticketPrice.toLocaleString()}`

    // Wizard (create only) — groups the sections into guided steps. Editing keeps
    // a single-page scroll (see stepCls). Sections stay mounted (hidden, not
    // unmounted) so no editor loses its state when you move between steps.
    const [wizardStep, setWizardStep] = useState(0)
    // Sell mode drives an adaptive step list: external skips tiers/seating/settings,
    // RSVP skips pricing, and assigned seating gets its own step.
    const sellMode: 'tickets' | 'rsvp' | 'external' =
        formData.ticketing_type === 'external' ? 'external'
            : formData.rsvp_enabled ? 'rsvp' : 'tickets'
    // Assigned seating turns tiers into pure price categories — their inventory
    // comes from the seat map, not a typed quantity. GA keeps the typed quantity.
    const isAssignedSeating = sellMode === 'tickets' && formData.seating_type === 'assigned_seating'
    const stepKeys: string[] = ['basics', 'when', 'sell']
    // Only assigned-seating events need the seating-options step (max per order +
    // seat-map note); GA has nothing extra to configure, so it skips it.
    if (isAssignedSeating) stepKeys.push('seating')
    if (sellMode !== 'external') stepKeys.push('settings')
    stepKeys.push('details')
    const STEP_TITLE: Record<string, string> = {
        basics: 'Basics', when: 'When & where', sell: 'Tickets', seating: 'Seating', settings: 'Settings', details: 'Details',
    }
    const curStepIdx = Math.min(wizardStep, stepKeys.length - 1)
    const curKey = stepKeys[curStepIdx]
    const stepCls = (key: string) => (isEditing ? 'space-y-8' : curKey === key ? 'space-y-8' : 'hidden')
    const goNext = () => {
        // Guard: don't advance past a step with missing/invalid required fields.
        if (!isEditing && !validateStep(curKey)) {
            window.scrollTo({ top: 0, behavior: 'smooth' })
            return
        }
        setWizardStep(s => Math.min(stepKeys.length - 1, s + 1))
    }
    const goBack = () => setWizardStep(s => Math.max(0, s - 1))
    // Jump to a step: back/current freely; forward only if the current step is valid.
    const goToStep = (i: number) => {
        if (isEditing || i <= curStepIdx || validateStep(curKey)) setWizardStep(i)
        else window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    useEffect(() => { if (!isEditing) window.scrollTo({ top: 0, behavior: 'smooth' }) }, [wizardStep, isEditing])

    // Derive the event's starting price ("From ₱X") and total capacity from the
    // tiers, so the rest of the app's single-price/capacity columns stay correct.
    useEffect(() => {
        if (isEditing || formData.ticketing_type === 'external') return
        const active = tiers.filter(t => t.name.trim())
        const prices = active.map(t => parseFloat(t.price) || 0)
        const minPrice = prices.length ? Math.min(...prices) : 0
        // Assigned seating: the per-tier split is set on the seat map, but the event
        // still needs a positive total capacity (events.capacity CHECK > 0, and the
        // map save doesn't write it back), so that's a manual field — only sync price.
        if (isAssignedSeating) {
            setFormData(prev => prev.ticket_price === String(minPrice) ? prev : { ...prev, ticket_price: String(minPrice) })
            return
        }
        // GA: capacity = sum of the typed quantities.
        const totalQty = active.reduce((s, t) => s + (parseInt(t.quantity) || 0), 0)
        setFormData(prev => (
            prev.ticket_price === String(minPrice) && prev.capacity === String(totalQty)
                ? prev
                : { ...prev, ticket_price: String(minPrice), capacity: String(totalQty) }
        ))
    }, [tiers, formData.ticketing_type, isEditing, isAssignedSeating])

    const handleInputChange = (field: keyof EventFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }))
        // Clear error for this field
        if (errors[field]) {
            setErrors(prev => {
                const newErrors = { ...prev }
                delete newErrors[field]
                return newErrors
            })
        }
    }

    const handlePlaceSelected = (place: {
        address: string
        city: string
        latitude: number
        longitude: number
        venue_name?: string
    }) => {
        setFormData(prev => ({
            ...prev,
            address: place.address,
            city: place.city,
            latitude: place.latitude,
            longitude: place.longitude,
            venue_name: place.venue_name || prev.venue_name,
        }))
    }

    const [coverDragActive, setCoverDragActive] = useState(false)

    const setCoverFile = (file: File | undefined | null) => {
        if (!file) return
        if (!file.type.startsWith('image/')) {
            setErrors(prev => ({ ...prev, cover_image: 'Please choose an image file (PNG, JPG or WebP)' }))
            return
        }
        if (file.size > 5 * 1024 * 1024) {
            setErrors(prev => ({ ...prev, cover_image: 'Image must be less than 5MB' }))
            return
        }
        setErrors(prev => { const n = { ...prev }; delete n.cover_image; return n })
        setFormData(prev => ({ ...prev, cover_image: file }))
        setCoverPreview(URL.createObjectURL(file))
    }

    const handleCoverImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCoverFile(e.target.files?.[0])
    }

    const handleCoverDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setCoverDragActive(false)
        setCoverFile(e.dataTransfer.files?.[0])
    }

    const handleAdditionalImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        const currentCount = existingImages.length + formData.additional_images.length

        if (currentCount + files.length > 5) {
            setErrors(prev => ({ ...prev, additional_images: 'Maximum 5 additional images allowed' }))
            return
        }

        const validFiles = files.filter(file => {
            if (file.size > 5 * 1024 * 1024) {
                setErrors(prev => ({ ...prev, additional_images: 'Each image must be less than 5MB' }))
                return false
            }
            return true
        })

        setFormData(prev => ({
            ...prev,
            additional_images: [...prev.additional_images, ...validFiles],
        }))

        const newPreviews = validFiles.map(file => URL.createObjectURL(file))
        setAdditionalPreviews(prev => [...prev, ...newPreviews])
    }

    const removeExistingImage = (index: number) => {
        setExistingImages(prev => prev.filter((_, i) => i !== index))
    }

    const removeNewImage = (index: number) => {
        setFormData(prev => ({
            ...prev,
            additional_images: prev.additional_images.filter((_, i) => i !== index),
        }))
        setAdditionalPreviews(prev => prev.filter((_, i) => i !== index))
    }

    const validateForm = (): Record<string, string> => {
        const newErrors: Record<string, string> = {}

        if (!formData.title || formData.title.length < 5) {
            newErrors.title = 'Title must be at least 5 characters'
        }
        if (!formData.category) {
            newErrors.category = 'Category is required'
        }
        if (!formData.venue_name) {
            newErrors.venue_name = 'Venue name is required'
        }
        if (!formData.address) {
            newErrors.address = 'Address is required'
        }
        if (!formData.latitude || !formData.longitude) {
            newErrors.location = 'Please select a location from the autocomplete'
        }
        if (!formData.start_datetime) {
            newErrors.start_datetime = 'Start date and time is required'
        } else if (new Date(formData.start_datetime) <= new Date() && !isEditing) {
            // Only validate future date for new events, not editing existing ones
            newErrors.start_datetime = 'Event must be in the future'
        }
        if (formData.end_datetime && new Date(formData.end_datetime) <= new Date(formData.start_datetime)) {
            newErrors.end_datetime = 'End time must be after start time'
        }
        if (formData.ticketing_type === 'external') {
            if (!formData.external_ticket_url) {
                newErrors.external_ticket_url = 'External ticket URL is required'
            } else {
                try { new URL(formData.external_ticket_url) } catch {
                    newErrors.external_ticket_url = 'Please enter a valid URL (e.g. https://ticketworld.com.ph/event)'
                }
            }
        } else if (isEditing) {
            if (!formData.ticket_price || parseFloat(formData.ticket_price) < 0) {
                newErrors.ticket_price = 'Ticket price must be 0 or greater'
            }
            if (!formData.capacity || parseInt(formData.capacity) < 1) {
                newErrors.capacity = 'Capacity must be at least 1'
            }
        } else {
            // Create flow validates the inline tier builder.
            const active = tiers.filter(t => t.name.trim())
            if (active.length === 0) {
                newErrors.tiers = isAssignedSeating ? 'Add at least one price category with a name' : 'Add at least one ticket type with a name'
            } else if (!isAssignedSeating && active.some(t => !(parseInt(t.quantity) >= 1))) {
                newErrors.tiers = 'Give each ticket type a quantity of at least 1'
            } else if (active.some(t => isNaN(parseFloat(t.price)) || parseFloat(t.price) < 0)) {
                newErrors.tiers = 'Ticket prices must be 0 or more'
            }
            if (isAssignedSeating && (!formData.capacity || parseInt(formData.capacity) < 1)) {
                newErrors.capacity = 'Enter your total capacity (at least 1)'
            }
        }
        if (!isEditing && !formData.cover_image) {
            // Required for new events, optional for updates (keep existing)
            newErrors.cover_image = 'Cover image is required'
        }
        // If editing and no new cover image, ensure we have an existing one
        if (isEditing && !formData.cover_image && !coverPreview) {
            newErrors.cover_image = 'Cover image is required'
        }

        if (formData.sales_end_datetime && new Date(formData.sales_end_datetime) >= new Date(formData.start_datetime)) {
            newErrors.sales_end_datetime = 'Sales must close before event starts'
        }

        setErrors(newErrors)
        return newErrors
    }

    // Which wizard step (by key) each validated field lives on, so a failed
    // publish can jump the organizer straight to the step that needs fixing.
    const FIELD_STEP: Record<string, string> = {
        title: 'basics', category: 'basics',
        venue_name: 'when', address: 'when', location: 'when', start_datetime: 'when', end_datetime: 'when', sales_end_datetime: 'when',
        ticket_price: 'sell', capacity: 'sell', external_ticket_url: 'sell', tiers: 'sell',
        cover_image: 'details',
    }

    // Validate just the current step's required fields (used by Continue / forward
    // navigation). Sets/clears only this step's errors so nothing shows on steps
    // the organizer hasn't reached yet.
    const validateStep = (key: string): boolean => {
        const e: Record<string, string> = {}
        if (key === 'basics') {
            if (!formData.title || formData.title.length < 5) e.title = 'Title must be at least 5 characters'
            if (!formData.category) e.category = 'Pick a category'
        } else if (key === 'when') {
            if (!formData.venue_name) e.venue_name = 'Venue name is required'
            if (!formData.address) e.address = 'Address is required'
            if (!formData.latitude || !formData.longitude) e.location = 'Pick a location from the suggestions'
            if (!formData.start_datetime) e.start_datetime = 'Start date and time is required'
            else if (new Date(formData.start_datetime) <= new Date() && !isEditing) e.start_datetime = 'Event must be in the future'
            if (formData.end_datetime && new Date(formData.end_datetime) <= new Date(formData.start_datetime)) e.end_datetime = 'End time must be after start time'
            if (formData.sales_end_datetime && formData.start_datetime && new Date(formData.sales_end_datetime) >= new Date(formData.start_datetime)) e.sales_end_datetime = 'Sales must close before the event starts'
        } else if (key === 'sell') {
            if (sellMode === 'external') {
                if (!formData.external_ticket_url) e.external_ticket_url = 'External ticket URL is required'
                else { try { new URL(formData.external_ticket_url) } catch { e.external_ticket_url = 'Enter a valid URL (e.g. https://ticketworld.com.ph/event)' } }
            } else {
                const active = tiers.filter(t => t.name.trim())
                if (active.length === 0) e.tiers = isAssignedSeating ? 'Add at least one price category with a name' : 'Add at least one ticket type with a name'
                else if (!isAssignedSeating && active.some(t => !(parseInt(t.quantity) >= 1))) e.tiers = 'Give each ticket type a quantity of at least 1'
                else if (active.some(t => isNaN(parseFloat(t.price)) || parseFloat(t.price) < 0)) e.tiers = 'Ticket prices must be 0 or more'
                if (isAssignedSeating && (!formData.capacity || parseInt(formData.capacity) < 1)) e.capacity = 'Enter your total capacity (at least 1)'
            }
        }
        // seating / settings / details have no fields that block Continue.
        setErrors(prev => {
            const next = { ...prev }
            Object.keys(FIELD_STEP).forEach(f => { if (FIELD_STEP[f] === key) delete next[f] })
            return { ...next, ...e }
        })
        return Object.keys(e).length === 0
    }

    const handleSubmit = async (status: 'draft' | 'active' | 'paused' | 'cancelled' | 'hidden') => {
        setFormData(prev => ({ ...prev, status }))

        const vErrors = validateForm()
        if (Object.keys(vErrors).length > 0) {
            // Guided create: surface the earliest step that has an error.
            if (!isEditing) {
                const firstIdx = Math.min(...Object.keys(vErrors).map(k => {
                    const i = stepKeys.indexOf(FIELD_STEP[k] || 'details')
                    return i < 0 ? stepKeys.length - 1 : i
                }))
                setWizardStep(firstIdx)
            }
            window.scrollTo({ top: 0, behavior: 'smooth' })
            return
        }

        setIsLoading(true)
        try {
            const formDataToSend = new FormData()

            // Add all text fields
            formDataToSend.append('title', formData.title)
            // Rich body goes to description_html; a stripped plain-text version
            // feeds SEO meta, share text, and event cards.
            const plainDescription = formData.description_html
                .replace(/<[^>]*>/g, ' ')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/\s+/g, ' ')
                .trim()
            formDataToSend.append('description', plainDescription.slice(0, 5000))
            formDataToSend.append('description_html', formData.description_html)
            formDataToSend.append('category', formData.category)
            formDataToSend.append('event_type', CATEGORY_TO_EVENT_TYPE[formData.category] || 'other')
            formDataToSend.append('venue_name', formData.venue_name)
            formDataToSend.append('address', formData.address)
            formDataToSend.append('city', formData.city)
            formDataToSend.append('latitude', formData.latitude?.toString() || '')
            formDataToSend.append('longitude', formData.longitude?.toString() || '')
            formDataToSend.append('start_datetime', formData.start_datetime)
            formDataToSend.append('end_datetime', formData.end_datetime)
            formDataToSend.append('ticket_price', formData.ticket_price)
            formDataToSend.append('capacity', formData.capacity)
            formDataToSend.append('sales_end_datetime', formData.sales_end_datetime)
            formDataToSend.append('custom_tos', formData.custom_tos)
            formDataToSend.append('status', status)
            formDataToSend.append('seating_type', formData.seating_type)
            formDataToSend.append('max_seats_per_order', formData.max_seats_per_order)
            formDataToSend.append('is_external', formData.ticketing_type === 'external' ? 'true' : 'false')
            formDataToSend.append('external_ticket_url', formData.external_ticket_url || '')
            formDataToSend.append('external_provider_name', formData.external_provider_name || '')
            formDataToSend.append('require_approval', formData.require_approval ? 'true' : 'false')
            formDataToSend.append('invite_only', formData.invite_only ? 'true' : 'false')
            formDataToSend.append('rsvp_enabled', formData.rsvp_enabled ? 'true' : 'false')
            formDataToSend.append('rsvp_button_label', formData.rsvp_button_label || '')
            formDataToSend.append('hide_venue_until_registered', formData.hide_venue_until_registered ? 'true' : 'false')
            formDataToSend.append('approval_email_subject', formData.approval_email_subject || '')
            formDataToSend.append('approval_email_body', formData.approval_email_body || '')
            formDataToSend.append('rejection_email_subject', formData.rejection_email_subject || '')
            formDataToSend.append('rejection_email_body', formData.rejection_email_body || '')

            // Ticket tiers (create flow, internal ticketing) — createEvent turns
            // these into ticket_tiers rows instead of a single default tier.
            if (!isEditing && formData.ticketing_type !== 'external') {
                const tierPayload = tiers
                    .filter(t => t.name.trim())
                    .map((t, i) => ({
                        name: t.name.trim(),
                        price: parseFloat(t.price) || 0,
                        quantity_total: parseInt(t.quantity) || 0,
                        sort_order: i,
                    }))
                formDataToSend.append('tiers', JSON.stringify(tierPayload))
            }

            // Only send organizer_id for create, backend handles auth for update
            if (!isEditing) {
                formDataToSend.append('organizer_id', partnerId)
            }

            // Add images
            if (formData.cover_image) {
                formDataToSend.append('cover_image', formData.cover_image)
            }

            // Handle additional images
            // 1. Existing images (send list of URLs to keep)
            if (isEditing) {
                formDataToSend.append('existing_images', JSON.stringify(existingImages))
            }

            // 2. New images
            formData.additional_images.forEach((image, index) => {
                formDataToSend.append(`additional_image_${index}`, image)
            })

            let result
            if (isEditing && eventId) {
                result = await updateEvent(eventId, formDataToSend)
            } else {
                result = await createEvent(formDataToSend)
            }

            if (result.error) {
                setErrors({ form: result.error })
                window.scrollTo({ top: 0, behavior: 'smooth' })
                toast({
                    title: "Error",
                    description: result.error,
                    variant: "destructive"
                })
            } else {
                toast({
                    title: "Success",
                    description: isEditing ? "Event updated successfully" : "Event saved! Now add your ticket tiers.",
                })
                try { localStorage.removeItem(AUTOSAVE_KEY) } catch { /* non-fatal */ }
                if (isEditing) {
                    router.push('/organizer/events')
                } else {
                    // Land on the success screen (share / embed / promote).
                    setPublished({ id: result.eventId as string, status })
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                }
            }
        } catch (error) {
            console.error('Error saving event:', error)
            setErrors({ form: 'Failed to save event. Please try again.' })
            window.scrollTo({ top: 0, behavior: 'smooth' })
        } finally {
            setIsLoading(false)
        }
    }

    if (published) {
        const publicUrl = `https://hanghut.com/events/${published.id}`
        const heading = published.status === 'active'
            ? 'Your event is live!'
            : published.status === 'hidden'
                ? 'Published as unlisted'
                : 'Saved as draft'
        const sub = published.status === 'active'
            ? 'Share it far and wide — here’s everything you need to fill the room.'
            : published.status === 'hidden'
                ? 'Only people with the link can see it. Publish it publicly anytime.'
                : 'It’s saved privately. Publish it when you’re ready.'
        const copyLink = async () => {
            try {
                await navigator.clipboard.writeText(publicUrl)
                setLinkCopied(true)
                setTimeout(() => setLinkCopied(false), 2000)
            } catch { /* clipboard blocked */ }
        }
        return (
            <div className="max-w-2xl mx-auto py-10 sm:py-16 space-y-8">
                <div className="text-center space-y-4">
                    <div className="mx-auto h-16 w-16 rounded-2xl bg-green-500/10 text-green-600 grid place-items-center">
                        <Check className="h-8 w-8" strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="font-headline text-3xl font-bold tracking-tight">{heading}</h1>
                        <p className="text-muted-foreground mt-1">{sub}</p>
                    </div>
                    <p className="text-lg font-semibold">{formData.title}</p>
                </div>

                <Card className="p-5 space-y-5">
                    <div className="space-y-2">
                        <Label>Share link</Label>
                        <div className="flex gap-2">
                            <Input
                                readOnly
                                value={publicUrl}
                                className="font-mono text-sm"
                                onFocus={(e) => e.currentTarget.select()}
                            />
                            <Button type="button" onClick={copyLink} className="shrink-0 gap-1.5">
                                {linkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                {linkCopied ? 'Copied' : 'Copy'}
                            </Button>
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-3">
                        <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => router.push(`/organizer/events/${published.id}`)}>
                            <ExternalLink className="h-4 w-4" /> Manage event
                        </Button>
                        <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => router.push('/organizer/developers/embed')}>
                            <Code2 className="h-4 w-4" /> Embed widget
                        </Button>
                        <Button type="button" className="justify-start gap-2 bg-primary" onClick={() => router.push('/organizer/marketing')}>
                            <Send className="h-4 w-4" /> Email subscribers
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Tip: turn on the <strong>New event announcement</strong> automation in Marketing and your subscribers get emailed automatically whenever you publish.
                    </p>
                </Card>

                <div className="flex items-center justify-center gap-3">
                    <Button type="button" variant="ghost" onClick={() => router.push('/organizer/events')}>Back to events</Button>
                    <Button type="button" variant="ghost" onClick={() => window.location.assign('/organizer/events/create')}>Create another</Button>
                </div>
            </div>
        )
    }

    if (step === 2 && createdEventId) {
        return (
            <div className="max-w-4xl mx-auto space-y-8 pb-20">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs font-semibold">1</span>
                        <span className="text-muted-foreground text-sm">Event Details</span>
                        <span className="text-muted-foreground">›</span>
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">2</span>
                        <span className="text-sm font-medium">Ticket Tiers</span>
                    </div>
                    <h1 className="text-4xl font-bold mb-2">Add Ticket Tiers</h1>
                    <p className="text-muted-foreground">Set up pricing tiers for your event. You can always add more later.</p>
                </div>
                <TicketTiersManager
                    eventId={createdEventId}
                    tiers={[]}
                    commissionRate={commissionRate}
                    passFeesToCustomer={passFeesToCustomer}
                    fixedFeePerTicket={fixedFeePerTicket}
                />
                <div className="flex gap-4 sticky bottom-0 bg-background pt-4 border-t">
                    <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        className="flex-1"
                        onClick={() => router.push(`/organizer/events/${createdEventId}`)}
                    >
                        Skip for now
                    </Button>
                    <Button
                        type="button"
                        size="lg"
                        className="flex-1 bg-primary"
                        onClick={() => router.push(`/organizer/events/${createdEventId}`)}
                    >
                        Finish & View Event
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-28">
            <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 p-6 sm:p-8 text-white shadow-lg">
                <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
                <div className="relative flex flex-wrap items-start justify-between gap-3">
                    <div>
                        {!isEditing && (
                            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 text-white px-3 py-1 text-xs font-semibold mb-3">
                                <Calendar className="h-3.5 w-3.5" /> New event
                            </div>
                        )}
                        <h1 className="font-headline text-3xl sm:text-4xl font-bold tracking-tight">
                            {isEditing ? 'Edit event' : 'Create event'}
                        </h1>
                        <p className="text-white/80 mt-1 max-w-lg">
                            {isEditing ? 'Update your event details.' : 'Fill in the details to bring your event to life — your work saves automatically as you go.'}
                        </p>
                    </div>
                    {!isEditing && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 backdrop-blur px-3 py-1 text-xs text-white/90">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-400" /> Draft autosaved
                        </span>
                    )}
                    {isEditing && eventId && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                            onClick={() => window.open(`/events/${eventId}`, '_blank')}
                        >
                            <ExternalLink className="h-4 w-4" /> View public page
                        </Button>
                    )}
                </div>
            </div>

            {!isEditing && (
                <nav className="flex flex-wrap items-center gap-1.5">
                    {stepKeys.map((key, i) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => goToStep(i)}
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                                i === curStepIdx
                                    ? 'bg-primary text-primary-foreground'
                                    : i < curStepIdx
                                        ? 'bg-primary/10 text-primary hover:bg-primary/15'
                                        : 'bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <span className={`grid place-items-center h-5 w-5 rounded-full text-[11px] ${i === curStepIdx ? 'bg-white/20' : 'bg-background/70'}`}>
                                {i + 1}
                            </span>
                            <span className="hidden sm:inline">{STEP_TITLE[key]}</span>
                        </button>
                    ))}
                </nav>
            )}

            {/* Edit: single-page manage view with a section jump-nav */}
            {isEditing && (
                <nav className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-1.5 rounded-lg bg-background/85 px-1 py-2 backdrop-blur">
                    {[
                        { key: 'basics', label: 'Basics', show: true },
                        { key: 'when', label: 'When & where', show: true },
                        { key: 'sell', label: 'Tickets', show: true },
                        { key: 'seating', label: 'Seating', show: formData.ticketing_type === 'internal' },
                        { key: 'settings', label: 'Settings', show: formData.ticketing_type === 'internal' },
                        { key: 'details', label: 'Details', show: true },
                    ].filter(s => s.show).map(s => (
                        <button
                            key={s.key}
                            type="button"
                            onClick={() => document.getElementById(`sec-${s.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                            className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        >
                            {s.label}
                        </button>
                    ))}
                </nav>
            )}

            {errors.form && (
                <Card className="p-4 bg-red-500/10 border-red-500/20">
                    <p className="text-red-500">{errors.form}</p>
                </Card>
            )}

            <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-8 items-start">
                <div className="min-w-0 space-y-8">
                    <div id="sec-basics" className={`scroll-mt-24 ${stepCls('basics')}`}>
                {/* Basic Information */}
                <Card className="p-6">
                    <h2 className="text-2xl font-bold mb-6">Basic Information</h2>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="title">Event Title *</Label>
                            <Input
                                id="title"
                                value={formData.title}
                                onChange={(e) => handleInputChange('title', e.target.value)}
                                placeholder="e.g., Summer Music Festival 2026"
                                maxLength={100}
                                className={errors.title ? 'border-red-500' : ''}
                            />
                            {errors.title && <p className="text-sm text-red-500 mt-1">{errors.title}</p>}
                        </div>

                        <div>
                            <Label htmlFor="description">Description</Label>
                            <p className="text-xs text-muted-foreground mb-2">
                                Format with rich text, paste HTML, or preview. This is shown on your event page.
                            </p>
                            <RichTextEditor
                                key={descKey}
                                value={formData.description_html}
                                onChange={(html) => handleInputChange('description_html', html)}
                            />
                        </div>

                        <div>
                            <Label>Category *</Label>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {categories.map((c) => {
                                    const selected = formData.category === c.key
                                    return (
                                        <button
                                            key={c.key}
                                            type="button"
                                            onClick={() => handleInputChange('category', c.key)}
                                            aria-pressed={selected}
                                            className={`inline-flex items-center rounded-full border px-3.5 py-2 text-sm font-medium transition-all ${
                                                selected
                                                    ? 'border-primary bg-primary/5 text-primary ring-2 ring-primary/20'
                                                    : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                                            }`}
                                        >
                                            {c.label}
                                        </button>
                                    )
                                })}
                                {categories.length === 0 && (
                                    <p className="text-sm text-muted-foreground">Loading categories…</p>
                                )}
                            </div>
                            {errors.category && <p className="text-sm text-red-500 mt-2">{errors.category}</p>}
                        </div>

                    </div>
                </Card>

                    </div>
                    <div id="sec-when" className={`scroll-mt-24 ${stepCls('when')}`}>
                {/* Location & Venue */}
                <Card className="p-6">
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                        <MapPin className="h-6 w-6" />
                        Location & Venue
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="venue_name">Venue Name *</Label>
                            <Input
                                id="venue_name"
                                value={formData.venue_name}
                                onChange={(e) => handleInputChange('venue_name', e.target.value)}
                                placeholder="e.g., Sky Garden Bar"
                                className={errors.venue_name ? 'border-red-500' : ''}
                            />
                            {errors.venue_name && <p className="text-sm text-red-500 mt-1">{errors.venue_name}</p>}
                        </div>

                        <GooglePlacesAutocomplete
                            onPlaceSelected={handlePlaceSelected}
                            error={errors.address || errors.location}
                        />

                        {/* Show currently selected address if editing and not yet changed via autocomplete */}
                        {isEditing && formData.address && (
                            <div className="text-sm text-muted-foreground">
                                Current: {formData.address}
                            </div>
                        )}

                        {formData.latitude && formData.longitude && (
                            <div className="text-sm text-muted-foreground">
                                📍 Location: {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                            </div>
                        )}
                    </div>
                </Card>

                {/* Date & Time */}
                <Card className="p-6">
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                        <Calendar className="h-6 w-6" />
                        Date & Time
                    </h2>
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="start_datetime">Start Date & Time *</Label>
                                <Input
                                    id="start_datetime"
                                    type="datetime-local"
                                    value={formData.start_datetime}
                                    onChange={(e) => handleInputChange('start_datetime', e.target.value)}
                                    className={errors.start_datetime ? 'border-red-500' : ''}
                                />
                                {errors.start_datetime && <p className="text-sm text-red-500 mt-1">{errors.start_datetime}</p>}
                            </div>

                            <div>
                                <Label htmlFor="end_datetime">End Date & Time (Optional)</Label>
                                <Input
                                    id="end_datetime"
                                    type="datetime-local"
                                    value={formData.end_datetime}
                                    onChange={(e) => handleInputChange('end_datetime', e.target.value)}
                                    className={errors.end_datetime ? 'border-red-500' : ''}
                                />
                                {errors.end_datetime && <p className="text-sm text-red-500 mt-1">{errors.end_datetime}</p>}
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="sales_end_datetime">Ticket Sales Close (Optional)</Label>
                            <Input
                                id="sales_end_datetime"
                                type="datetime-local"
                                value={formData.sales_end_datetime}
                                onChange={(e) => handleInputChange('sales_end_datetime', e.target.value)}
                                className={errors.sales_end_datetime ? 'border-red-500' : ''}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Defaults to 1 hour before event starts if not set
                            </p>
                            {errors.sales_end_datetime && <p className="text-sm text-red-500 mt-1">{errors.sales_end_datetime}</p>}
                        </div>
                    </div>
                </Card>

                    </div>
                    <div id="sec-sell" className={`scroll-mt-24 ${stepCls('sell')}`}>
                {/* Ticketing & Pricing */}
                <Card className="p-6">
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                        <DollarSign className="h-6 w-6" />
                        Ticketing & Pricing
                    </h2>
                    <div className="space-y-4">
                        {/* Sell-mode chooser — reshapes the rest of the wizard */}
                        {!isEditing && (
                            <div>
                                <Label>How are you hosting this?</Label>
                                <div className="grid sm:grid-cols-3 gap-3 mt-2">
                                    <button
                                        type="button"
                                        onClick={() => { handleInputChange('ticketing_type', 'internal'); handleInputChange('rsvp_enabled', false) }}
                                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                                            sellMode === 'tickets' ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'border-border hover:border-primary/40'
                                        }`}
                                    >
                                        <div className="font-semibold">Paid tickets</div>
                                        <p className="text-sm text-muted-foreground mt-1">Sell tickets on HangHut</p>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            handleInputChange('ticketing_type', 'internal')
                                            handleInputChange('rsvp_enabled', true)
                                            setTiers(t => t.map(x => ({ ...x, price: '0' })))
                                        }}
                                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                                            sellMode === 'rsvp' ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'border-border hover:border-primary/40'
                                        }`}
                                    >
                                        <div className="font-semibold">Free RSVP</div>
                                        <p className="text-sm text-muted-foreground mt-1">One-tap reserve, no checkout</p>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleInputChange('ticketing_type', 'external')}
                                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                                            sellMode === 'external' ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'border-border hover:border-primary/40'
                                        }`}
                                    >
                                        <div className="font-semibold">External link</div>
                                        <p className="text-sm text-muted-foreground mt-1">Link to another seller</p>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* RSVP button label (free RSVP mode) */}
                        {!isEditing && sellMode === 'rsvp' && (
                            <div>
                                <Label htmlFor="rsvp_button_label">RSVP button text</Label>
                                <Input
                                    id="rsvp_button_label"
                                    value={formData.rsvp_button_label}
                                    onChange={(e) => handleInputChange('rsvp_button_label', e.target.value)}
                                    placeholder="RSVP"
                                    maxLength={30}
                                />
                                <p className="text-xs text-muted-foreground mt-1">Attendees reserve with one tap and get a scannable QR — no payment.</p>
                            </div>
                        )}

                        {/* Ticketing Type toggle (edit only — keeps existing behavior) */}
                        {isEditing && (
                            <div>
                                <Label>Ticketing Type</Label>
                                <div className="grid grid-cols-2 gap-3 mt-2">
                                    <button
                                        type="button"
                                        onClick={() => handleInputChange('ticketing_type', 'internal')}
                                        className={`p-4 rounded-lg border-2 text-left transition-all ${
                                            formData.ticketing_type === 'internal' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
                                        }`}
                                    >
                                        <div className="font-semibold">HangHut Ticketing</div>
                                        <p className="text-sm text-muted-foreground mt-1">Sell tickets directly through HangHut</p>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleInputChange('ticketing_type', 'external')}
                                        className={`p-4 rounded-lg border-2 text-left transition-all ${
                                            formData.ticketing_type === 'external' ? 'border-blue-500 bg-blue-50/50' : 'border-border hover:border-muted-foreground/30'
                                        }`}
                                    >
                                        <div className="font-semibold">External URL</div>
                                        <p className="text-sm text-muted-foreground mt-1">Link to an external ticketing site</p>
                                    </button>
                                </div>
                            </div>
                        )}

                        {formData.ticketing_type === 'external' ? (
                            <>
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
                                    Clicks on the &quot;Get Tickets&quot; button will be tracked and billed at <strong>$0.10 USD per unique click</strong> per user. Monthly invoicing applies.
                                </div>
                                <div>
                                    <Label htmlFor="external_ticket_url">Ticket URL * <span className="text-muted-foreground font-normal">(where buyers go to purchase)</span></Label>
                                    <Input
                                        id="external_ticket_url"
                                        type="url"
                                        value={formData.external_ticket_url}
                                        onChange={(e) => handleInputChange('external_ticket_url', e.target.value)}
                                        placeholder="https://ticketworld.com.ph/events/your-event"
                                        className={errors.external_ticket_url ? 'border-red-500' : ''}
                                    />
                                    {errors.external_ticket_url && <p className="text-sm text-red-500 mt-1">{errors.external_ticket_url}</p>}
                                </div>
                                <div>
                                    <Label htmlFor="external_provider_name">Ticketing Provider <span className="text-muted-foreground font-normal">(optional)</span></Label>
                                    <Input
                                        id="external_provider_name"
                                        value={formData.external_provider_name}
                                        onChange={(e) => handleInputChange('external_provider_name', e.target.value)}
                                        placeholder="e.g. TicketWorld, SM Tickets, Eventbrite"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Shown on the CTA button as &quot;Get Tickets on {formData.external_provider_name || 'Provider'}&quot;
                                    </p>
                                </div>
                                <div>
                                    <Label htmlFor="ticket_price">Starting Price (₱) <span className="text-muted-foreground font-normal">(shown as &quot;From ₱X&quot;)</span></Label>
                                    <Input
                                        id="ticket_price"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={formData.ticket_price}
                                        onChange={(e) => handleInputChange('ticket_price', e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                            </>
                        ) : isEditing ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="ticket_price">Ticket Price (₱) *</Label>
                                    <Input
                                        id="ticket_price"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={formData.ticket_price}
                                        onChange={(e) => handleInputChange('ticket_price', e.target.value)}
                                        placeholder="0 for free events"
                                        className={errors.ticket_price ? 'border-red-500' : ''}
                                    />
                                    {errors.ticket_price && <p className="text-sm text-red-500 mt-1">{errors.ticket_price}</p>}
                                </div>

                                <div>
                                    <Label htmlFor="capacity">Total Capacity *</Label>
                                    <Input
                                        id="capacity"
                                        type="number"
                                        min="1"
                                        value={formData.capacity}
                                        onChange={(e) => handleInputChange('capacity', e.target.value)}
                                        placeholder="e.g., 100"
                                        className={errors.capacity ? 'border-red-500' : ''}
                                    />
                                    {errors.capacity && <p className="text-sm text-red-500 mt-1">{errors.capacity}</p>}
                                </div>
                            </div>
                        ) : (
                            /* Create flow: build ticket tiers inline. Created on publish; the
                               event's starting price + total capacity are derived from them. */
                            <div className="space-y-3">
                                {/* Seating model drives what "quantity" means below, so it's
                                    chosen here (paid tickets only; RSVP has no seat map). */}
                                {sellMode === 'tickets' && (
                                    <div className="space-y-2">
                                        <Label>How are tickets seated?</Label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                onClick={() => handleInputChange('seating_type', 'general_admission')}
                                                className={`p-3 rounded-lg border-2 text-left transition-all ${
                                                    !isAssignedSeating ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
                                                }`}
                                            >
                                                <div className="font-semibold text-sm">General Admission</div>
                                                <p className="text-xs text-muted-foreground mt-0.5">Set a quantity per ticket type</p>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleInputChange('seating_type', 'assigned_seating')}
                                                className={`p-3 rounded-lg border-2 text-left transition-all ${
                                                    isAssignedSeating ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
                                                }`}
                                            >
                                                <div className="font-semibold text-sm">Assigned Seating</div>
                                                <p className="text-xs text-muted-foreground mt-0.5">Quantities come from your seat map</p>
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <div className="flex items-center justify-between">
                                    <Label>{isAssignedSeating ? 'Price categories *' : 'Ticket types *'}</Label>
                                    <span className="text-xs text-muted-foreground">
                                        {isAssignedSeating ? 'Assign seats to these on the seat map' : 'Buyers pick from these at checkout'}
                                    </span>
                                </div>
                                {tiers.map((t) => (
                                    <div key={t.id} className="rounded-xl border p-3 sm:p-4 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Input
                                                value={t.name}
                                                onChange={(e) => updateTier(t.id, 'name', e.target.value)}
                                                placeholder="e.g. General Admission, VIP, Early Bird"
                                                className="font-medium"
                                            />
                                            {tiers.length > 1 && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="shrink-0 text-muted-foreground hover:text-destructive"
                                                    onClick={() => removeTier(t.id)}
                                                    aria-label="Remove ticket type"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <Label className="text-xs">Price (₱)</Label>
                                                {sellMode === 'rsvp' ? (
                                                    <div className="h-10 flex items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">Free</div>
                                                ) : (
                                                    <Input
                                                        type="number" min="0" step="0.01"
                                                        value={t.price}
                                                        onChange={(e) => updateTier(t.id, 'price', e.target.value)}
                                                        placeholder="0"
                                                    />
                                                )}
                                            </div>
                                            <div>
                                                <Label className="text-xs">{sellMode === 'rsvp' ? 'Spots available' : 'Quantity'}</Label>
                                                {isAssignedSeating ? (
                                                    <div className="h-10 flex items-center gap-1.5 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                                                        <Armchair className="h-3.5 w-3.5 shrink-0" /> Set by seat map
                                                    </div>
                                                ) : (
                                                    <Input
                                                        type="number" min="1"
                                                        value={t.quantity}
                                                        onChange={(e) => updateTier(t.id, 'quantity', e.target.value)}
                                                        placeholder="e.g. 100"
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <Button type="button" variant="outline" onClick={addTier} className="w-full gap-1.5 border-dashed">
                                    <Plus className="h-4 w-4" /> Add {isAssignedSeating ? 'price category' : 'ticket type'}
                                </Button>
                                {isAssignedSeating && (
                                    <div className="rounded-xl border p-3 sm:p-4">
                                        <Label htmlFor="assigned_capacity" className="text-xs">Total capacity (all seats) *</Label>
                                        <Input
                                            id="assigned_capacity"
                                            type="number" min="1"
                                            value={formData.capacity}
                                            onChange={(e) => handleInputChange('capacity', e.target.value)}
                                            placeholder="e.g. 300"
                                            className={errors.capacity ? 'border-red-500' : ''}
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Your venue&apos;s total seats. You&apos;ll place them exactly — and split them across the price categories above — on the seat map.
                                        </p>
                                        {errors.capacity && <p className="text-sm text-red-500 mt-1">{errors.capacity}</p>}
                                    </div>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    {isAssignedSeating
                                        ? 'Use a price of 0 for free seats. How many of each price category sells is set by the seats you assign on the seat map.'
                                        : 'Use a price of 0 for free tickets. Total capacity is the sum of all quantities.'}
                                </p>
                                {errors.tiers && <p className="text-sm text-red-500">{errors.tiers}</p>}
                            </div>
                        )}

                        {/* Pricing Preview — only for internal */}
                        {formData.ticketing_type === 'internal' && ticketPrice > 0 && (
                            <Card className="p-4 bg-muted/50">
                                <h3 className="font-semibold mb-2">Pricing Breakdown</h3>
                                <div className="space-y-1 text-sm">
                                    <div className="flex justify-between">
                                        <span>Ticket Price:</span>
                                        <span className="font-medium">₱{ticketPrice.toFixed(2)}</span>
                                    </div>

                                    {passFeesToCustomer ? (
                                        <>
                                            <div className="flex justify-between text-muted-foreground border-t border-border pt-1 mt-1">
                                                <span>Customer Pays (Price + Booking Fee):</span>
                                                <span className="font-medium">₱{(
                                                    ticketPrice + fixedFeePerTicket
                                                ).toFixed(2)}</span>
                                            </div>

                                            <div className="flex justify-between text-red-600 mt-2">
                                                <span>Platform Fee ({(commissionRate * 100).toFixed(1)}%):</span>
                                                <span className="font-medium">-₱{(ticketPrice * commissionRate).toFixed(2)}</span>
                                            </div>

                                            <div className="flex justify-between pt-2 border-t border-border font-bold text-green-600">
                                                <span>You'll receive:*</span>
                                                <span>₱{(
                                                    ticketPrice -
                                                    (ticketPrice * commissionRate)
                                                ).toFixed(2)} per ticket</span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex justify-between text-red-600">
                                                <span>Platform Fee ({(commissionRate * 100).toFixed(1)}%):</span>
                                                <span className="font-medium">-₱{platformFee.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between pt-2 border-t border-border font-bold text-green-600">
                                                <span>You'll receive:*</span>
                                                <span>₱{organizerPayout.toFixed(2)} per ticket</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="mt-3 text-xs text-muted-foreground leading-relaxed border-t border-border pt-2 space-y-1">
                                    <p>
                                        <span className="font-medium text-foreground">*</span> Before payment processing fees. Each
                                        transaction also incurs Xendit&apos;s processing fee (deducted at settlement), which varies by how
                                        the customer pays:
                                    </p>
                                    <ul className="list-disc pl-4 space-y-0.5">
                                        <li>E-wallets — GCash 2.3%, GrabPay &amp; ShopeePay 2.0%, Maya 1.8%</li>
                                        <li>QRPh — 1.4% (or ₱15)</li>
                                        <li>Cards — 3.2% + ₱10 (local), 4.2% + ₱10 (international in PHP), 4% + USD 1 (charged in USD)</li>
                                    </ul>
                                    <p>So your actual net per ticket will be slightly lower than shown.</p>
                                </div>
                            </Card>
                        )}
                    </div>
                </Card>

                    </div>
                    <div id="sec-seating" className={`scroll-mt-24 ${stepCls('seating')}`}>
                {/* Seating Configuration — only for internal ticketing */}
                {formData.ticketing_type === 'internal' && (
                <Card className="p-6">
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                        <Armchair className="h-6 w-6" />
                        Seating Configuration
                    </h2>
                    <div className="space-y-4">
                        {/* Create flow chooses the seating model in the Tickets step (it
                            drives what "quantity" means); editing keeps it here. */}
                        {isEditing && (
                        <div>
                            <Label>Seating Type</Label>
                            <div className="grid grid-cols-2 gap-3 mt-2">
                                <button
                                    type="button"
                                    onClick={() => handleInputChange('seating_type', 'general_admission')}
                                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                                        formData.seating_type === 'general_admission'
                                            ? 'border-primary bg-primary/5'
                                            : 'border-border hover:border-muted-foreground/30'
                                    }`}
                                >
                                    <div className="font-semibold">General Admission</div>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        No assigned seats — first come, first served
                                    </p>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleInputChange('seating_type', 'assigned_seating')}
                                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                                        formData.seating_type === 'assigned_seating'
                                            ? 'border-primary bg-primary/5'
                                            : 'border-border hover:border-muted-foreground/30'
                                    }`}
                                >
                                    <div className="font-semibold">Assigned Seating</div>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Buyers pick specific seats from a seat map
                                    </p>
                                </button>
                            </div>
                        </div>
                        )}

                        {formData.seating_type === 'assigned_seating' && (
                            <>
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
                                    <strong>Note:</strong> After saving, configure your seat map in the <strong>Seat Map</strong> tab on the event dashboard.
                                </div>
                                <div className="max-w-xs">
                                    <Label htmlFor="max_seats_per_order">Max Seats Per Order</Label>
                                    <Input
                                        id="max_seats_per_order"
                                        type="number"
                                        min="1"
                                        max="50"
                                        value={formData.max_seats_per_order}
                                        onChange={(e) => handleInputChange('max_seats_per_order', e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Maximum number of seats a buyer can select in one order
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                </Card>
                )}

                    </div>
                    <div id="sec-settings" className={`scroll-mt-24 ${stepCls('settings')}`}>
                {/* Registration Settings */}
                {formData.ticketing_type === 'internal' && (
                <Card className="p-6">
                    <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
                        Registration Settings
                    </h2>
                    <p className="text-sm text-muted-foreground mb-6">
                        Control how attendees register for your event.
                    </p>
                    <div className="space-y-4">
                        {/* Private / invite-only */}
                        <div className="flex items-center justify-between gap-4 p-4 border rounded-lg">
                            <div className="min-w-0">
                                <h3 className="font-semibold">Private (invite-only)</h3>
                                <p className="text-sm text-muted-foreground">
                                    Hide this event from discovery. Only people you invite by email can
                                    register; others can request to join. Manage your guest list from the
                                    event&apos;s Invites tab after saving.
                                </p>
                            </div>
                            <Switch
                                className="shrink-0"
                                checked={formData.invite_only}
                                onCheckedChange={(v) => handleInputChange('invite_only', v)}
                            />
                        </div>

                        <div className="flex items-center justify-between gap-4 p-4 border rounded-lg">
                            <div className="min-w-0">
                                <h3 className="font-semibold">Require Approval</h3>
                                <p className="text-sm text-muted-foreground">
                                    Attendees must be approved before their spot is confirmed.
                                    {formData.ticket_price !== '0' && parseFloat(formData.ticket_price) > 0 && (
                                        <span className="text-orange-500 block mt-1">Available for free events only in this version.</span>
                                    )}
                                </p>
                            </div>
                            <Switch
                                className="shrink-0"
                                checked={formData.require_approval}
                                disabled={formData.ticket_price !== '0' && parseFloat(formData.ticket_price) > 0}
                                onCheckedChange={(v) => handleInputChange('require_approval', v)}
                            />
                        </div>
                        {/* Approval email templates — shown when require_approval is on */}
                        {formData.require_approval && (
                            <div className="border rounded-lg p-4 space-y-6">
                                <p className="text-sm font-semibold text-foreground">Registration Email Templates</p>
                                <p className="text-xs text-muted-foreground -mt-4">
                                    Customize the emails sent when you approve or reject a registration.
                                    Use merge tags to personalize.
                                </p>

                                {/* Merge tag chips */}
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-2">Merge tags (click to copy):</p>
                                    <div className="flex flex-wrap gap-2">
                                        {['{{name}}', '{{event_title}}', '{{event_date}}', '{{event_venue}}', '{{organizer_name}}'].map(tag => (
                                            <button
                                                key={tag}
                                                type="button"
                                                onClick={() => navigator.clipboard.writeText(tag)}
                                                className="text-xs bg-muted px-2 py-1 rounded font-mono hover:bg-primary/10 hover:text-primary transition-colors"
                                            >
                                                {tag}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Approval Email */}
                                <div className="space-y-3">
                                    <h4 className="text-sm font-semibold text-green-700 dark:text-green-400">✅ Approval Email</h4>
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Subject</label>
                                        <input
                                            type="text"
                                            value={formData.approval_email_subject}
                                            onChange={e => handleInputChange('approval_email_subject', e.target.value)}
                                            placeholder="Your registration for {{event_title}} has been approved!"
                                            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                                        />
                                    </div>
                                    <div>
                                        <div className="flex gap-2 mb-2">
                                            {(['visual', 'html', 'preview'] as const).map(mode => (
                                                <button
                                                    key={mode}
                                                    type="button"
                                                    onClick={() => handleInputChange('_approval_mode', mode)}
                                                    className={`text-xs px-3 py-1 rounded-md border transition-colors capitalize ${
                                                        ((formData as any)._approval_mode || 'visual') === mode
                                                            ? 'bg-primary text-primary-foreground border-primary'
                                                            : 'bg-background border-border hover:bg-muted'
                                                    }`}
                                                >{mode}</button>
                                            ))}
                                        </div>
                                        {(formData as any)._approval_mode === 'html' ? (
                                            <textarea
                                                value={formData.approval_email_body}
                                                onChange={e => handleInputChange('approval_email_body', e.target.value)}
                                                placeholder="<h1>You're in!</h1><p>Hi {{name}}, your registration for {{event_title}} has been approved.</p>"
                                                rows={8}
                                                className="w-full border rounded-md px-3 py-2 text-sm font-mono bg-slate-950 text-green-400 border-slate-700 placeholder:text-slate-600"
                                            />
                                        ) : (formData as any)._approval_mode === 'preview' ? (
                                            <div className="border rounded-md overflow-hidden bg-white" style={{ height: 340 }}>
                                                <iframe
                                                    srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif;font-size:14px;line-height:1.6;color:#111;padding:20px;margin:0}h1,h2,h3{margin-top:0}</style></head><body>${
                                                        (formData.approval_email_body || '<p><em>No content yet.</em></p>')
                                                            .replace(/\{\{name\}\}/g, 'Juan dela Cruz')
                                                            .replace(/\{\{event_title\}\}/g, formData.title || 'Your Event')
                                                            .replace(/\{\{event_date\}\}/g, 'Saturday, June 14 · 7:00 PM')
                                                            .replace(/\{\{event_venue\}\}/g, formData.venue_name || 'The Venue')
                                                            .replace(/\{\{organizer_name\}\}/g, 'The Organizer')
                                                    }</body></html>`}
                                                    className="w-full h-full"
                                                    sandbox="allow-same-origin"
                                                    title="Approval Email Preview"
                                                />
                                            </div>
                                        ) : (
                                            <textarea
                                                value={formData.approval_email_body}
                                                onChange={e => handleInputChange('approval_email_body', e.target.value)}
                                                placeholder={`Hi {{name}},\n\nGreat news! Your registration for {{event_title}} on {{event_date}} at {{event_venue}} has been approved.\n\nWe look forward to seeing you there!\n\n— {{organizer_name}}`}
                                                rows={8}
                                                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                                            />
                                        )}
                                    </div>
                                </div>

                                {/* Rejection Email */}
                                <div className="space-y-3 pt-4 border-t">
                                    <h4 className="text-sm font-semibold text-red-700 dark:text-red-400">❌ Rejection Email</h4>
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        <button
                                            type="button"
                                            onClick={() => navigator.clipboard.writeText('{{reason}}')}
                                            className="text-xs bg-muted px-2 py-1 rounded font-mono hover:bg-primary/10 hover:text-primary transition-colors"
                                        >
                                            {'{{reason}}'}
                                        </button>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Subject</label>
                                        <input
                                            type="text"
                                            value={formData.rejection_email_subject}
                                            onChange={e => handleInputChange('rejection_email_subject', e.target.value)}
                                            placeholder="Update on your registration for {{event_title}}"
                                            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                                        />
                                    </div>
                                    <div>
                                        <div className="flex gap-2 mb-2">
                                            {(['visual', 'html', 'preview'] as const).map(mode => (
                                                <button
                                                    key={mode}
                                                    type="button"
                                                    onClick={() => handleInputChange('_rejection_mode', mode)}
                                                    className={`text-xs px-3 py-1 rounded-md border transition-colors capitalize ${
                                                        ((formData as any)._rejection_mode || 'visual') === mode
                                                            ? 'bg-primary text-primary-foreground border-primary'
                                                            : 'bg-background border-border hover:bg-muted'
                                                    }`}
                                                >{mode}</button>
                                            ))}
                                        </div>
                                        {(formData as any)._rejection_mode === 'html' ? (
                                            <textarea
                                                value={formData.rejection_email_body}
                                                onChange={e => handleInputChange('rejection_email_body', e.target.value)}
                                                placeholder="<h1>Registration Update</h1><p>Hi {{name}}, unfortunately your registration for {{event_title}} was not approved.</p><p>{{reason}}</p>"
                                                rows={8}
                                                className="w-full border rounded-md px-3 py-2 text-sm font-mono bg-slate-950 text-green-400 border-slate-700 placeholder:text-slate-600"
                                            />
                                        ) : (formData as any)._rejection_mode === 'preview' ? (
                                            <div className="border rounded-md overflow-hidden bg-white" style={{ height: 340 }}>
                                                <iframe
                                                    srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif;font-size:14px;line-height:1.6;color:#111;padding:20px;margin:0}h1,h2,h3{margin-top:0}</style></head><body>${
                                                        (formData.rejection_email_body || '<p><em>No content yet.</em></p>')
                                                            .replace(/\{\{name\}\}/g, 'Juan dela Cruz')
                                                            .replace(/\{\{event_title\}\}/g, (formData as any).title || 'Your Event')
                                                            .replace(/\{\{event_date\}\}/g, 'Saturday, June 14 · 7:00 PM')
                                                            .replace(/\{\{event_venue\}\}/g, (formData as any).venue_name || 'The Venue')
                                                            .replace(/\{\{organizer_name\}\}/g, 'The Organizer')
                                                            .replace(/\{\{reason\}\}/g, "We've reached capacity for this event.")
                                                    }</body></html>`}
                                                    className="w-full h-full"
                                                    sandbox="allow-same-origin"
                                                    title="Rejection Email Preview"
                                                />
                                            </div>
                                        ) : (
                                            <textarea
                                                value={formData.rejection_email_body}
                                                onChange={e => handleInputChange('rejection_email_body', e.target.value)}
                                                placeholder={`Hi {{name}},\n\nThank you for your interest in {{event_title}}. Unfortunately, we were unable to approve your registration at this time.\n\n{{reason}}\n\n— {{organizer_name}}`}
                                                rows={8}
                                                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-between gap-4 p-4 border rounded-lg">
                            <div className="min-w-0">
                                <h3 className="font-semibold">Hide Venue Until Registered</h3>
                                <p className="text-sm text-muted-foreground">
                                    The venue address is hidden from the public event page. Only registered attendees can see it.
                                </p>
                            </div>
                            <Switch
                                className="shrink-0"
                                checked={formData.hide_venue_until_registered}
                                onCheckedChange={(v) => handleInputChange('hide_venue_until_registered', v)}
                            />
                        </div>
                    </div>
                </Card>
                )}

                    </div>
                    <div id="sec-details" className={`scroll-mt-24 ${stepCls('details')}`}>
                {/* Media & Images */}
                <Card className="p-6">
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                        <Upload className="h-6 w-6" />
                        Media & Images
                    </h2>
                    <div className="space-y-6">
                        {/* Cover Image */}
                        <div>
                            <Label>Cover Image * (Max 5MB)</Label>
                            <div className="mt-2">
                                {coverPreview ? (
                                    <div className="relative">
                                        <img
                                            src={coverPreview}
                                            alt="Cover preview"
                                            className="w-full h-64 object-cover rounded-lg"
                                        />
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            size="sm"
                                            className="absolute top-2 right-2"
                                            onClick={() => {
                                                setFormData(prev => ({ ...prev, cover_image: null }))
                                                setCoverPreview(null)
                                            }}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <label
                                        onDragOver={(e) => { e.preventDefault(); setCoverDragActive(true) }}
                                        onDragLeave={(e) => { e.preventDefault(); setCoverDragActive(false) }}
                                        onDrop={handleCoverDrop}
                                        className={`flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
                                            coverDragActive
                                                ? 'border-primary bg-primary/5 scale-[.99]'
                                                : 'border-border hover:border-primary/40 hover:bg-muted/40'
                                        }`}
                                    >
                                        <div className="flex flex-col items-center justify-center pt-5 pb-6 pointer-events-none">
                                            <div className={`h-14 w-14 mb-3 rounded-2xl grid place-items-center transition-colors ${coverDragActive ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'}`}>
                                                <Upload className="h-6 w-6" />
                                            </div>
                                            <p className="mb-1 text-sm">
                                                <span className="font-semibold text-foreground">{coverDragActive ? 'Drop to upload' : 'Click to upload'}</span>
                                                {!coverDragActive && <span className="text-muted-foreground"> or drag &amp; drop your poster</span>}
                                            </p>
                                            <p className="text-xs text-muted-foreground">PNG, JPG or WebP · up to 5 MB · 16:9 looks best</p>
                                        </div>
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={handleCoverImageChange}
                                        />
                                    </label>
                                )}
                            </div>
                            {errors.cover_image && <p className="text-sm text-red-500 mt-1">{errors.cover_image}</p>}
                        </div>

                        {/* Additional Images */}
                        <div>
                            <Label>Additional Images (Optional, Max 5)</Label>
                            <div className="mt-2 space-y-4">
                                {existingImages.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-sm text-muted-foreground">Current Images:</p>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                            {existingImages.map((src, index) => (
                                                <div key={`existing-${index}`} className="relative">
                                                    <img
                                                        src={src}
                                                        alt={`Existing ${index + 1}`}
                                                        className="w-full h-32 object-cover rounded-lg"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="destructive"
                                                        size="sm"
                                                        className="absolute top-1 right-1"
                                                        onClick={() => removeExistingImage(index)}
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {additionalPreviews.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-sm text-muted-foreground">New Images:</p>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                            {additionalPreviews.map((preview, index) => (
                                                <div key={`new-${index}`} className="relative">
                                                    <img
                                                        src={preview}
                                                        alt={`New upload ${index + 1}`}
                                                        className="w-full h-32 object-cover rounded-lg"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="destructive"
                                                        size="sm"
                                                        className="absolute top-1 right-1"
                                                        onClick={() => removeNewImage(index)}
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {existingImages.length + formData.additional_images.length < 5 && (
                                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                                        <div className="flex flex-col items-center justify-center">
                                            <Upload className="h-8 w-8 mb-2 text-muted-foreground" />
                                            <p className="text-sm text-muted-foreground">
                                                Add more images ({existingImages.length + formData.additional_images.length}/5)
                                            </p>
                                        </div>
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept="image/*"
                                            multiple
                                            onChange={handleAdditionalImagesChange}
                                        />
                                    </label>
                                )}
                            </div>
                            {errors.additional_images && <p className="text-sm text-red-500 mt-1">{errors.additional_images}</p>}
                        </div>
                    </div>
                </Card>

                {/* Subscriber Discounts — edit only (requires an eventId) */}
                {eventId && (
                    <SubscriberDiscountsSection
                        eventId={eventId}
                        subscriptionTiers={subscriptionTiers}
                        existingDiscounts={existingDiscounts}
                    />
                )}

                {/* Custom Terms & Conditions */}
                <Card className="p-6">
                    <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
                        <FileText className="h-6 w-6" />
                        Terms & Conditions (Optional)
                    </h2>
                    <p className="text-sm text-muted-foreground mb-6">
                        Add event-specific terms that customers must accept at checkout. Leave empty to use your organization&apos;s default terms.
                    </p>
                    <Textarea
                        value={formData.custom_tos}
                        onChange={(e) => handleInputChange('custom_tos', e.target.value)}
                        placeholder={`e.g., No refunds within 24 hours of the event.\nAttendees must be 18 years or older.\nThe organizer is not liable for lost belongings.`}
                        rows={6}
                        maxLength={2000}
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                        {formData.custom_tos.length}/2000 characters
                    </p>
                </Card>

                {isEditing && (
                    <Card className="p-6 border-orange-200 bg-orange-50/30">
                        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                            Manage Event Status
                        </h2>
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between p-4 border rounded-lg bg-background">
                                <div>
                                    <h3 className="font-semibold">Visibility</h3>
                                    <p className="text-sm text-muted-foreground">
                                        {formData.status === 'hidden'
                                            ? 'Event is hidden from public pages.'
                                            : 'Event is visible to everyone.'}
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => handleSubmit(formData.status === 'hidden' ? 'active' : 'hidden')}
                                >
                                    {formData.status === 'hidden' ? 'Make Public' : 'Hide Event'}
                                </Button>
                            </div>

                            <div className="flex items-center justify-between p-4 border rounded-lg bg-background">
                                <div>
                                    <h3 className="font-semibold">Sales Status</h3>
                                    <p className="text-sm text-muted-foreground">
                                        {formData.status === 'paused'
                                            ? 'Ticket sales are currently paused.'
                                            : formData.status === 'cancelled'
                                                ? 'Event is cancelled.'
                                                : 'Ticket sales are active.'}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    {formData.status !== 'cancelled' && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => handleSubmit(formData.status === 'paused' ? 'active' : 'paused')}
                                        >
                                            {formData.status === 'paused' ? 'Resume Sales' : 'Pause Sales'}
                                        </Button>
                                    )}
                                    {formData.status !== 'cancelled' && (
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            onClick={() => {
                                                if (confirm('Are you sure you want to cancel this event? This action cannot be undone.')) {
                                                    handleSubmit('cancelled')
                                                }
                                            }}
                                        >
                                            Cancel Event
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </Card>
                )}

                    </div>{/* /step 4 */}

                    {/* Publish actions — always for edit; only on the last step for create */}
                    {(isEditing || curStepIdx === stepKeys.length - 1) && (
                        <div className="flex gap-4 pt-4 border-t flex-wrap">
                            {!isEditing && (
                                <Button type="button" variant="ghost" size="lg" onClick={goBack}>← Back</Button>
                            )}
                            <Button
                                type="button"
                                variant="outline"
                                size="lg"
                                className="flex-1"
                                onClick={() => handleSubmit('draft')}
                                disabled={isLoading || formData.status === 'cancelled'}
                            >
                                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Save as Draft'}
                            </Button>
                            {!isEditing && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="lg"
                                    className="flex-1 border-purple-300 text-purple-700 hover:bg-purple-50"
                                    onClick={() => handleSubmit('hidden')}
                                    disabled={isLoading}
                                >
                                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Publish as Unlisted'}
                                </Button>
                            )}
                            <Button
                                type="button"
                                size="lg"
                                className="flex-1 bg-primary"
                                onClick={() => handleSubmit(isEditing ? formData.status : 'active')}
                                disabled={isLoading || formData.status === 'cancelled'}
                            >
                                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (isEditing ? 'Update Event' : 'Publish event')}
                            </Button>
                        </div>
                    )}
                </div>{/* /form column */}

                {/* Live event-page preview */}
                <aside className="hidden lg:block lg:sticky lg:top-6">
                    <EventPreviewPane
                        title={formData.title}
                        categoryLabel={categories.find(c => c.key === formData.category)?.label || null}
                        coverPreview={coverPreview}
                        venueName={formData.venue_name}
                        city={formData.city}
                        startDatetime={formData.start_datetime}
                        priceLabel={priceLabel}
                        reveal={isEditing || curStepIdx >= 1}
                    />
                </aside>
            </div>{/* /grid */}

            {/* Sticky nav for the guided steps (create) */}
            {!isEditing && curStepIdx < stepKeys.length - 1 && (
                <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 backdrop-blur">
                    <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
                        <span className="text-xs text-muted-foreground hidden sm:block">
                            Step {curStepIdx + 1} of {stepKeys.length} · {STEP_TITLE[curKey]}
                        </span>
                        <div className="ml-auto flex items-center gap-3">
                            <Button type="button" variant="outline" onClick={goBack} disabled={wizardStep === 0}>Back</Button>
                            <Button type="button" className="bg-primary" onClick={goNext}>Continue →</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

/** Live, brand-styled preview of the public event page, shown beside the create wizard. */
function EventPreviewPane({
    title, categoryLabel, coverPreview, venueName, city, startDatetime, priceLabel, reveal,
}: {
    title: string
    categoryLabel: string | null
    coverPreview: string | null
    venueName: string
    city: string
    startDatetime: string
    priceLabel: string
    reveal: boolean
}) {
    if (!reveal) {
        return (
            <div className="rounded-2xl border border-dashed p-8 text-center space-y-3">
                <div className="mx-auto h-12 w-12 rounded-2xl bg-primary/10 text-primary grid place-items-center">
                    <Calendar className="h-6 w-6" />
                </div>
                <p className="font-semibold text-sm">Your live preview is coming up</p>
                <p className="text-xs text-muted-foreground max-w-[26ch] mx-auto">
                    Add a date and location next and your event page builds itself right here.
                </p>
            </div>
        )
    }

    const venue = [venueName, city].filter(Boolean).join(', ')
    let dateStr = ''
    try {
        if (startDatetime) {
            dateStr = new Date(startDatetime).toLocaleString('en-PH', {
                weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
            })
        }
    } catch { /* invalid partial date */ }

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Live preview
            </div>
            <div className="rounded-2xl border overflow-hidden bg-card shadow-sm">
                <div className="aspect-[16/10] relative bg-muted">
                    {coverPreview ? (
                        <img src={coverPreview} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full grid place-items-center bg-gradient-to-br from-primary/25 via-primary/10 to-transparent">
                            <Upload className="h-7 w-7 text-primary/40" />
                        </div>
                    )}
                    {categoryLabel && (
                        <span className="absolute top-3 left-3 rounded-full bg-black/55 text-white text-xs font-medium px-3 py-1 backdrop-blur">
                            {categoryLabel}
                        </span>
                    )}
                </div>
                <div className="p-4 space-y-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-primary">{priceLabel}</p>
                    <h3 className="font-headline text-xl font-bold leading-tight tracking-tight">
                        {title || 'Your event title'}
                    </h3>
                    <div className="space-y-1.5 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="h-4 w-4 shrink-0" /> {dateStr || 'Date TBA'}
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="h-4 w-4 shrink-0" /> <span className="truncate">{venue || 'Venue TBA'}</span>
                        </div>
                    </div>
                    <div className="rounded-full bg-primary text-primary-foreground text-center text-sm font-semibold py-2.5">
                        Get Tickets
                    </div>
                </div>
            </div>
            <p className="text-[11px] text-center text-muted-foreground">A preview of your public event page.</p>
        </div>
    )
}
