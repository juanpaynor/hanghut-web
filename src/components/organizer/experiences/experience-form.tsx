'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { createClient } from '@/lib/supabase/client'
import { createExperience, updateExperience } from '@/lib/organizer/experience-actions'
import { Plus, X, Upload, Loader2, ImageIcon, Check, CalendarClock, MapPin } from 'lucide-react'
import { GooglePlacesAutocomplete } from '@/components/organizer/google-places-autocomplete'
import { SessionsEditor } from '@/components/organizer/experiences/sessions-editor'
import { saveAvailabilityRule } from '@/lib/organizer/experience-availability-actions'
import { blankRule, estimateSlotCount, sessionConflicts, type RuleInput } from '@/lib/organizer/experience-availability'

/**
 * Create runs as a guided wizard; edit stays a single page.
 *
 * The wizard exists for one reason: AVAILABILITY IS NOW A REQUIRED STEP. The
 * old form had no schedule field at all and pushed to a list on save, so a
 * host could publish a 2,720-peso listing that was hidden from buyers the
 * instant it existed — which is exactly what happened to three live listings
 * on prod, with nothing telling their hosts.
 */
const STEPS = [
    { key: 'basics',       title: 'The basics',   blurb: 'What it is and what it looks like' },
    { key: 'location',     title: 'Where',        blurb: 'Where guests should turn up' },
    { key: 'pricing',      title: 'Price',        blurb: 'What a seat costs, and how many there are' },
    { key: 'availability', title: 'When',         blurb: 'The dates guests can actually book' },
    { key: 'details',      title: 'Details',      blurb: "What's included, what to bring" },
] as const

const EXPERIENCE_TYPES = [
    { value: 'workshop',  label: 'Workshop' },
    { value: 'adventure', label: 'Adventure' },
    { value: 'food_tour', label: 'Food Tour' },
    { value: 'dining',    label: 'Dining' },
    { value: 'nightlife', label: 'Nightlife' },
    { value: 'culture',   label: 'Culture' },
    { value: 'tour',      label: 'Tour' },
    { value: 'other',     label: 'Other' },
]

interface Experience {
    id: string
    title: string
    description: string
    experience_type: string
    price_per_person: number
    currency: string
    max_guests: number
    location_name: string
    latitude: number | null
    longitude: number | null
    requirements: string[]
    included_items: string[]
    images: string[]
}

interface Props {
    partnerId: string
    experience?: Experience
}

export function ExperienceForm({ partnerId, experience }: Props) {
    const { toast } = useToast()
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [uploading, setUploading] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)
    const isEditing = !!experience

    const [title, setTitle] = useState(experience?.title || '')
    const [description, setDescription] = useState(experience?.description || '')
    const [type, setType] = useState(experience?.experience_type || '')
    const [price, setPrice] = useState(experience ? String(experience.price_per_person) : '')
    const [maxGuests, setMaxGuests] = useState(experience ? String(experience.max_guests) : '')
    const [locationName, setLocationName] = useState(experience?.location_name || '')
    const [lat, setLat] = useState(experience?.latitude ? String(experience.latitude) : '')
    const [lng, setLng] = useState(experience?.longitude ? String(experience.longitude) : '')
    const [images, setImages] = useState<string[]>(experience?.images || [])
    const [requirements, setRequirements] = useState<string[]>(experience?.requirements || [])
    const [includedItems, setIncludedItems] = useState<string[]>(experience?.included_items || [])
    const [newReq, setNewReq] = useState('')
    const [newItem, setNewItem] = useState('')

    // Wizard. Editing shows everything at once — an existing listing already
    // has dates, so there is nothing to force.
    const [stepIdx, setStepIdx] = useState(0)
    const step = STEPS[stepIdx]
    const onLastStep = stepIdx === STEPS.length - 1
    const show = (key: typeof STEPS[number]['key']) => isEditing || step.key === key

    // A LIST, not one rule. "1pm for ₱500 and 2pm for ₱1,000" is two sessions,
    // each generating its own slots with its own price, capacity and cutoff.
    const [sessions, setSessions] = useState<RuleInput[]>([blankRule()])
    const totalDates = sessions.reduce((n, r) => n + estimateSlotCount(r), 0)
    const sessionIssue = sessionConflicts(sessions).find(Boolean) ?? null

    /** What blocks Continue on the current step. Returning the REASON rather
     *  than a boolean lets the button explain itself instead of sitting
     *  greyed out with no clue why. */
    const blockedBecause = (): string | null => {
        switch (step.key) {
            case 'basics':
                if (!title.trim()) return 'Give it a title'
                if (!type) return 'Pick a type'
                if (!description.trim()) return 'Add a description'
                return null
            case 'location':
                if (!locationName.trim()) return 'Search for the venue'
                // 0,0 is Null Island, in the Gulf of Guinea. Four of the seven
                // experiences on prod are pinned there — including both ₱2,000
                // jewellery workshops — because the old form asked for raw
                // decimal latitude and longitude and hosts left them blank.
                if (!lat || !lng || (Number(lat) === 0 && Number(lng) === 0)) {
                    return 'Pick the venue from the search results so it has a map pin'
                }
                return null
            case 'pricing':
                if (!price || Number(price) <= 0) return 'Set a price'
                if (!maxGuests || Number(maxGuests) < 1) return 'Set how many guests fit'
                return null
            case 'availability':
                if (sessions.some(r => !r.byweekday.length)) return 'Pick the days each session runs on'
                if (totalDates < 1) return 'Those dates produce no sessions — check the window'
                if (sessions.some(r => !(r.max_guests > 0))) return 'Set how many guests fit in each session'
                if (sessionIssue) return 'Two sessions clash — fix the flagged one'
                return null
            default:
                return null
        }
    }
    const blocked = blockedBecause()

    const goNext = () => {
        if (blocked) { toast({ title: blocked, variant: 'destructive' }); return }
        // Capacity carries forward so the host does not retype it.
        if (step.key === 'pricing') {
            // Carry capacity across, but only into sessions still at 0, so
            // going Back and forward never clobbers a deliberate choice.
            setSessions(rs => rs.map(r =>
                r.max_guests ? r : { ...r, max_guests: Number(maxGuests) || 8 }))
        }
        setStepIdx(i => Math.min(i + 1, STEPS.length - 1))
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    const goBack = () => {
        setStepIdx(i => Math.max(i - 1, 0))
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    /** Places gives us the pin; venue_name is optional on its result, so fall
     *  back to the formatted address rather than leaving the host with a blank
     *  required field after a successful search. */
    const handlePlaceSelected = (place: {
        address: string; city: string; latitude: number; longitude: number; venue_name?: string
    }) => {
        setLocationName(place.venue_name?.trim() || place.address)
        setLat(String(place.latitude))
        setLng(String(place.longitude))
    }

    const handleImageUpload = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            toast({ title: 'Images only', variant: 'destructive' })
            return
        }
        setUploading(true)
        const supabase = createClient()
        const ext = file.name.split('.').pop()
        const path = `${partnerId}/${Date.now()}.${ext}`

        const { error } = await supabase.storage.from('experiences').upload(path, file, { upsert: true })
        if (error) {
            toast({ title: 'Upload failed', description: error.message, variant: 'destructive' })
            setUploading(false)
            return
        }

        const { data: { publicUrl } } = supabase.storage.from('experiences').getPublicUrl(path)
        setImages(prev => [...prev, publicUrl])
        setUploading(false)
    }

    const handleSave = () => {
        startTransition(async () => {
            const payload = {
                title,
                description,
                experience_type: type,
                price_per_person: Number(price),
                max_guests: Number(maxGuests),
                location_name: locationName,
                latitude: lat ? Number(lat) : 0,
                longitude: lng ? Number(lng) : 0,
                requirements,
                included_items: includedItems,
                images,
            }

            // Branched rather than unioned: createExperience returns an id and
            // updateExperience does not, so a shared `result` collapses to a
            // type with neither.
            if (isEditing) {
                const updated = await updateExperience(experience.id, payload)
                if (updated.error) {
                    toast({ title: 'Error', description: updated.error, variant: 'destructive' })
                    return
                }
                toast({ title: 'Experience updated' })
                router.push('/organizer/experiences')
                return
            }

            const created = await createExperience(payload)
            if (created.error || !created.id) {
                toast({ title: 'Error', description: created.error ?? 'Could not create the experience', variant: 'destructive' })
                return
            }

            // Sessions are saved WITH the listing and generate their dates
            // immediately, so the host lands on a calendar that already has
            // dates in it. This is the whole point of the wizard: the old flow
            // saved a listing with no dates and said nothing.
            //
            // Saved one at a time because each save regenerates for the whole
            // listing, and the generator is idempotent — the last call simply
            // converges on the full set.
            let made = 0
            for (const session of sessions) {
                const saved = await saveAvailabilityRule(created.id, session)
                if ('error' in saved && saved.error) {
                    // The listing exists; only the schedule failed. Say that
                    // precisely and send them where they can fix it — implying
                    // nothing was created would be worse than the failure.
                    toast({
                        title: 'Created, but some dates were not set',
                        description: `${saved.error}. Add them from the calendar.`,
                        variant: 'destructive',
                    })
                    router.push(`/organizer/experiences/${created.id}/edit`)
                    return
                }
                made += ('generated' in saved ? saved.generated?.created : 0) ?? 0
            }

            toast({
                title: 'Experience published',
                description: made > 0
                    ? `${made} bookable ${made === 1 ? 'date is' : 'dates are'} live now${sessions.length > 1 ? ` across ${sessions.length} sessions` : ''}.`
                    : 'Dates will appear shortly.',
            })
            router.push('/organizer/experiences')
        })
    }

    return (
        <div className="max-w-2xl space-y-8">
            {/* ── Stepper (create only) ───────────────────────────────── */}
            {!isEditing && (
                <div className="space-y-4">
                    <ol className="flex items-center gap-1.5">
                        {STEPS.map((st, i) => (
                            <li key={st.key} className="flex-1">
                                <button
                                    type="button"
                                    // Backwards only. Jumping ahead would skip the
                                    // validation that makes each step mean something.
                                    onClick={() => i < stepIdx && setStepIdx(i)}
                                    disabled={i > stepIdx}
                                    aria-current={i === stepIdx ? 'step' : undefined}
                                    className={`block h-1.5 w-full rounded-full transition-colors ${
                                        i < stepIdx ? 'bg-primary'
                                        : i === stepIdx ? 'bg-primary/60'
                                        : 'bg-muted'
                                    } ${i < stepIdx ? 'cursor-pointer hover:bg-primary/80' : ''}`}
                                >
                                    <span className="sr-only">{st.title}</span>
                                </button>
                            </li>
                        ))}
                    </ol>
                    <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Step {stepIdx + 1} of {STEPS.length}
                        </p>
                        <h2 className="mt-1 text-xl font-bold tracking-tight">{step.title}</h2>
                        <p className="text-sm text-muted-foreground">{step.blurb}</p>
                    </div>
                </div>
            )}

            {show('basics') && (<>
            {/* Images */}
            <div className="space-y-3">
                <Label>Photos</Label>
                <div className="flex flex-wrap gap-3">
                    {images.map((url, i) => (
                        <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden border border-border group">
                            <img src={url} alt="" className="w-full h-full object-cover" />
                            <button
                                type="button"
                                onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                                className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="w-24 h-24 rounded-xl border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                    >
                        {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><ImageIcon className="h-5 w-5" /><span className="text-xs">Add photo</span></>}
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />
                </div>
            </div>

            {/* Basic info */}
            <div className="space-y-4">
                <div className="space-y-1.5">
                    <Label>Title <span className="text-destructive">*</span></Label>
                    <Input placeholder="e.g. Sunset Pottery Workshop" value={title} onChange={e => setTitle(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                    <Label>Description <span className="text-destructive">*</span></Label>
                    <Textarea rows={4} placeholder="Describe the experience for guests" value={description} onChange={e => setDescription(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                    <Label>Type <span className="text-destructive">*</span></Label>
                    <Select value={type} onValueChange={setType}>
                        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                        <SelectContent>
                            {EXPERIENCE_TYPES.map(t => (
                                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            </>)}

            {show('pricing') && (<>
            {/* Price + capacity. Its own step so the availability step below
                can inherit the capacity instead of asking twice. */}
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label>Price per person (₱) <span className="text-destructive">*</span></Label>
                    <Input type="number" min={1} placeholder="999" value={price} onChange={e => setPrice(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                    <Label>Max guests per slot <span className="text-destructive">*</span></Label>
                    <Input type="number" min={1} max={100} placeholder="8" value={maxGuests} onChange={e => setMaxGuests(e.target.value)} />
                </div>
            </div>
            </>)}

            {show('availability') && !isEditing && (<>
            {/* THE STEP THIS WIZARD EXISTS FOR. A listing with no bookable
                date is invisible to buyers, and the old form had no way to
                set one — three live listings on prod were published that way
                and never seen. Continue is blocked until the pattern yields
                at least one date. */}
            <div className="rounded-xl border bg-card p-5">
                <div className="mb-5 flex items-start gap-3">
                    <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                        <p className="font-semibold">When does this run?</p>
                        <p className="text-sm text-muted-foreground">
                            Add a session for each time you run it — a 1pm and a 2pm
                            can have different prices and capacities. We keep the
                            calendar filled 90 days ahead, so it never quietly runs out.
                        </p>
                    </div>
                </div>
                <SessionsEditor
                    value={sessions}
                    onChange={setSessions}
                    defaultMaxGuests={Number(maxGuests) || undefined}
                />
            </div>
            </>)}

            {show('location') && (<>
            {/* Location.
                Search, not three text boxes. Experiences shipped with a raw
                venue field and hand-typed latitude/longitude — the events form
                has used Google Places since it was built, and asking a host
                for decimal coordinates is asking them to leave them blank. A
                listing with 0,0 is unmappable and undiscoverable by distance. */}
            <div className="space-y-4">
                <Label className="text-base font-semibold">Location</Label>

                <div className="space-y-1.5">
                    <Label>Search for the venue <span className="text-destructive">*</span></Label>
                    <GooglePlacesAutocomplete onPlaceSelected={handlePlaceSelected} />
                </div>

                {locationName ? (
                    <div className="rounded-lg border bg-muted/40 p-3.5 space-y-2.5">
                        <div className="flex items-start gap-2.5">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <div className="min-w-0 flex-1 space-y-1.5">
                                <Label htmlFor="venue-name" className="text-xs text-muted-foreground">
                                    Venue name guests will see
                                </Label>
                                {/* Editable on purpose: Places often returns a mall
                                    or building where the host means "Studio 4, 3rd
                                    floor". The coordinates stay whatever was picked. */}
                                <Input
                                    id="venue-name"
                                    value={locationName}
                                    onChange={e => setLocationName(e.target.value)}
                                />
                                {lat && lng && (
                                    <p className="text-xs text-muted-foreground">
                                        Pinned at {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground">
                        Start typing and pick a result — this is what puts your
                        experience on the map.
                    </p>
                )}
            </div>

            </>)}

            {show('details') && (<>
            {/* What's included */}
            <div className="space-y-3">
                <Label className="text-base font-semibold">What&apos;s Included</Label>
                {includedItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <span className="flex-1 text-sm bg-muted/40 rounded-lg px-3 py-2">{item}</span>
                        <button type="button" onClick={() => setIncludedItems(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ))}
                <div className="flex gap-2">
                    <Input placeholder="e.g. All materials provided" value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newItem.trim()) { setIncludedItems(p => [...p, newItem.trim()]); setNewItem('') } }} />
                    <Button type="button" variant="outline" size="icon" onClick={() => { if (newItem.trim()) { setIncludedItems(p => [...p, newItem.trim()]); setNewItem('') } }}>
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Requirements */}
            <div className="space-y-3">
                <Label className="text-base font-semibold">What to Bring / Requirements</Label>
                {requirements.map((req, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <span className="flex-1 text-sm bg-muted/40 rounded-lg px-3 py-2">{req}</span>
                        <button type="button" onClick={() => setRequirements(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ))}
                <div className="flex gap-2">
                    <Input placeholder="e.g. Wear comfortable clothes" value={newReq} onChange={e => setNewReq(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newReq.trim()) { setRequirements(p => [...p, newReq.trim()]); setNewReq('') } }} />
                    <Button type="button" variant="outline" size="icon" onClick={() => { if (newReq.trim()) { setRequirements(p => [...p, newReq.trim()]); setNewReq('') } }}>
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            </>)}

            {/* ── Actions ─────────────────────────────────────────────── */}
            {isEditing ? (
                <div className="flex gap-3 border-t pt-5">
                    <Button onClick={handleSave} disabled={isPending || uploading} className="flex-1">
                        {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : 'Save Changes'}
                    </Button>
                    <Button variant="outline" onClick={() => router.push('/organizer/experiences')} disabled={isPending}>
                        Cancel
                    </Button>
                </div>
            ) : (
                <div className="space-y-3 border-t pt-5">
                    <div className="flex gap-3">
                        {stepIdx > 0 && (
                            <Button type="button" variant="ghost" onClick={goBack} disabled={isPending}>
                                ← Back
                            </Button>
                        )}
                        {onLastStep ? (
                            <Button onClick={handleSave} disabled={isPending || uploading} className="flex-1">
                                {isPending
                                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Publishing…</>
                                    : <><Check className="mr-2 h-4 w-4" />Publish experience</>}
                            </Button>
                        ) : (
                            <Button type="button" onClick={goNext} className="flex-1" disabled={uploading}>
                                Continue →
                            </Button>
                        )}
                    </div>
                    {/* The reason, not a greyed-out button. A disabled Continue
                        with no explanation is how the old flow lost people. */}
                    {blocked && (
                        <p className="text-xs text-muted-foreground">{blocked} to continue.</p>
                    )}
                    {onLastStep && totalDates > 0 && (
                        <p className="text-xs text-muted-foreground">
                            Publishing creates {totalDates} bookable {totalDates === 1 ? 'date' : 'dates'} straight away
                            {sessions.length > 1 && ` across ${sessions.length} sessions`}.
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}
