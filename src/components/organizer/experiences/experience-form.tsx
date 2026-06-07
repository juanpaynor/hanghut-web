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
import { Plus, X, Upload, Loader2, ImageIcon } from 'lucide-react'

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

            const result = isEditing
                ? await updateExperience(experience.id, payload)
                : await createExperience(payload)

            if (result.error) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
                return
            }

            toast({ title: isEditing ? 'Experience updated' : 'Experience created' })
            router.push('/organizer/experiences')
        })
    }

    return (
        <div className="max-w-2xl space-y-8">
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
                <div className="grid grid-cols-2 gap-4">
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
                    <div className="space-y-1.5">
                        <Label>Price per person (₱) <span className="text-destructive">*</span></Label>
                        <Input type="number" min={1} placeholder="999" value={price} onChange={e => setPrice(e.target.value)} />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label>Max guests per slot <span className="text-destructive">*</span></Label>
                    <Input type="number" min={1} max={100} placeholder="8" value={maxGuests} onChange={e => setMaxGuests(e.target.value)} />
                </div>
            </div>

            {/* Location */}
            <div className="space-y-4">
                <Label className="text-base font-semibold">Location</Label>
                <div className="space-y-1.5">
                    <Label>Venue Name <span className="text-destructive">*</span></Label>
                    <Input placeholder="e.g. The Clay Studio, BGC" value={locationName} onChange={e => setLocationName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <Label>Latitude</Label>
                        <Input type="number" step="any" placeholder="14.5547" value={lat} onChange={e => setLat(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Longitude</Label>
                        <Input type="number" step="any" placeholder="121.0244" value={lng} onChange={e => setLng(e.target.value)} />
                    </div>
                </div>
            </div>

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

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                <Button onClick={handleSave} disabled={isPending || uploading} className="flex-1">
                    {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : isEditing ? 'Save Changes' : 'Create Experience'}
                </Button>
                <Button variant="outline" onClick={() => router.push('/organizer/experiences')} disabled={isPending}>
                    Cancel
                </Button>
            </div>
        </div>
    )
}
