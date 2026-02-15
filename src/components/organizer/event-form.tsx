'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Calendar, MapPin, Upload, X, Loader2, DollarSign } from 'lucide-react'
import { createEvent, updateEvent } from '@/lib/organizer/event-actions'
import { GooglePlacesAutocomplete } from '@/components/organizer/google-places-autocomplete'
import { useToast } from '@/hooks/use-toast'

interface EventFormData {
    title: string
    description: string
    event_type: string
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
    status: 'draft' | 'active' | 'paused' | 'cancelled' | 'hidden'
}

interface EventFormProps {
    partnerId: string
    commissionRate: number
    initialData?: any // Can be typed more strictly if needed
    eventId?: string
    passFeesToCustomer: boolean
    fixedFeePerTicket: number
}

export function EventForm({
    partnerId,
    commissionRate,
    initialData,
    eventId,
    passFeesToCustomer,
    fixedFeePerTicket
}: EventFormProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [isLoading, setIsLoading] = useState(false)
    const [coverPreview, setCoverPreview] = useState<string | null>(initialData?.cover_image_url || null)

    // For existing events, we might have existing images URLs
    const [existingImages, setExistingImages] = useState<string[]>(initialData?.images || [])
    const [additionalPreviews, setAdditionalPreviews] = useState<string[]>([])
    const [errors, setErrors] = useState<Record<string, string>>({})

    const isEditing = !!eventId

    const [formData, setFormData] = useState<EventFormData>({
        title: initialData?.title || '',
        description: initialData?.description || '',
        event_type: initialData?.event_type || 'concert',
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
        status: initialData?.status || 'draft',
    })

    // Calculate pricing preview
    const ticketPrice = parseFloat(formData.ticket_price) || 0
    const platformFee = ticketPrice * commissionRate
    const processingFee = ticketPrice * 0.04
    const organizerPayout = ticketPrice - platformFee - processingFee

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

    const handleCoverImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                setErrors(prev => ({ ...prev, cover_image: 'Image must be less than 5MB' }))
                return
            }
            setFormData(prev => ({ ...prev, cover_image: file }))
            setCoverPreview(URL.createObjectURL(file))
        }
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

    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {}

        if (!formData.title || formData.title.length < 5) {
            newErrors.title = 'Title must be at least 5 characters'
        }
        if (!formData.event_type) {
            newErrors.event_type = 'Event type is required'
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
        if (!formData.ticket_price || parseFloat(formData.ticket_price) < 0) {
            newErrors.ticket_price = 'Ticket price must be 0 or greater'
        }
        if (!formData.capacity || parseInt(formData.capacity) < 1) {
            newErrors.capacity = 'Capacity must be at least 1'
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
        return Object.keys(newErrors).length === 0
    }

    const handleSubmit = async (status: 'draft' | 'active' | 'paused' | 'cancelled' | 'hidden') => {
        setFormData(prev => ({ ...prev, status }))

        if (!validateForm()) {
            window.scrollTo({ top: 0, behavior: 'smooth' })
            return
        }

        setIsLoading(true)
        try {
            const formDataToSend = new FormData()

            // Add all text fields
            formDataToSend.append('title', formData.title)
            formDataToSend.append('description', formData.description)
            formDataToSend.append('event_type', formData.event_type)
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
            formDataToSend.append('status', status)

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
                    description: isEditing ? "Event updated successfully" : "Event created successfully",
                })
                router.push('/organizer/events')
            }
        } catch (error) {
            console.error('Error saving event:', error)
            setErrors({ form: 'Failed to save event. Please try again.' })
            window.scrollTo({ top: 0, behavior: 'smooth' })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-20">
            <div>
                <h1 className="text-4xl font-bold mb-2">
                    {isEditing ? 'Edit Event' : 'Create Event'}
                </h1>
                <p className="text-muted-foreground">
                    {isEditing ? 'Update your event details' : 'Fill in the details to create your ticketed event'}
                </p>
            </div>

            {errors.form && (
                <Card className="p-4 bg-red-500/10 border-red-500/20">
                    <p className="text-red-500">{errors.form}</p>
                </Card>
            )}

            <div className="space-y-8">
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
                            <Textarea
                                id="description"
                                value={formData.description}
                                onChange={(e) => handleInputChange('description', e.target.value)}
                                placeholder="Tell attendees what to expect..."
                                rows={4}
                                maxLength={2000}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                {formData.description.length}/2000 characters
                            </p>
                        </div>

                        <div>
                            <Label htmlFor="event_type">Event Type *</Label>
                            <Select
                                value={formData.event_type}
                                onValueChange={(value) => handleInputChange('event_type', value)}
                            >
                                <SelectTrigger className={errors.event_type ? 'border-red-500' : ''}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="concert">Music & Concerts</SelectItem>
                                    <SelectItem value="sports">Sports & Fitness</SelectItem>
                                    <SelectItem value="food">Food & Drink</SelectItem>
                                    <SelectItem value="workshop">Workshop & Classes</SelectItem>
                                    <SelectItem value="nightlife">Nightlife & Parties</SelectItem>
                                    <SelectItem value="art">Arts & Culture</SelectItem>
                                </SelectContent>
                            </Select>
                            {errors.event_type && <p className="text-sm text-red-500 mt-1">{errors.event_type}</p>}
                        </div>
                    </div>
                </Card>

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

                {/* Ticketing & Pricing */}
                <Card className="p-6">
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                        <DollarSign className="h-6 w-6" />
                        Ticketing & Pricing
                    </h2>
                    <div className="space-y-4">
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

                        {/* Pricing Preview */}
                        {ticketPrice > 0 && (
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
                                            <div className="flex justify-between text-red-600">
                                                <span>Processing Fee (4%):</span>
                                                <span className="font-medium">-₱{(ticketPrice * 0.04).toFixed(2)}</span>
                                            </div>

                                            <div className="flex justify-between pt-2 border-t border-border font-bold text-green-600">
                                                <span>You'll receive:</span>
                                                <span>₱{(
                                                    ticketPrice -
                                                    (ticketPrice * commissionRate) -
                                                    (ticketPrice * 0.04)
                                                ).toFixed(2)} per ticket</span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex justify-between text-red-600">
                                                <span>Platform Fee ({(commissionRate * 100).toFixed(1)}%):</span>
                                                <span className="font-medium">-₱{platformFee.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between text-red-600">
                                                <span>Processing Fee (4% + ₱15):</span>
                                                <span className="font-medium">-₱{(processingFee + 15).toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between pt-2 border-t border-border font-bold text-green-600">
                                                <span>You'll receive:</span>
                                                <span>₱{(organizerPayout - 15).toFixed(2)} per ticket</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </Card>
                        )}
                    </div>
                </Card>

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
                                    <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                            <Upload className="h-12 w-12 mb-3 text-muted-foreground" />
                                            <p className="mb-2 text-sm text-muted-foreground">
                                                <span className="font-semibold">Click to upload</span> or drag and drop
                                            </p>
                                            <p className="text-xs text-muted-foreground">PNG, JPG or WebP (MAX. 5MB)</p>
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

                {/* Action Buttons */}
                <div className="flex gap-4 sticky bottom-0 bg-background pt-4 border-t">
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
                    <Button
                        type="button"
                        size="lg"
                        className="flex-1 bg-primary"
                        onClick={() => handleSubmit('active')}
                        disabled={isLoading || formData.status === 'cancelled'}
                    >
                        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (isEditing ? 'Update Event' : 'Publish Event')}
                    </Button>
                </div>
            </div>
        </div>
    )
}
