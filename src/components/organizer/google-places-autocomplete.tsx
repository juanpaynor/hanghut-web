'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, MapPin } from 'lucide-react'

interface PlaceResult {
    address: string
    city: string
    latitude: number
    longitude: number
    venue_name?: string
}

interface GooglePlacesAutocompleteProps {
    onPlaceSelected: (place: PlaceResult) => void
    error?: string
}

// A prediction as we render it. Built from the NEW Places API
// (google.maps.places.AutocompleteSuggestion) — the classic AutocompleteService
// + PlacesService are deprecated and unavailable to new Google customers.
type Suggestion = {
    placeId: string
    mainText: string
    secondaryText: string
    prediction: google.maps.places.PlacePrediction
}

export function GooglePlacesAutocomplete({ onPlaceSelected, error }: GooglePlacesAutocompleteProps) {
    const [query, setQuery] = useState('')
    const [predictions, setPredictions] = useState<Suggestion[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [showPredictions, setShowPredictions] = useState(false)
    const ready = useRef(false)
    // A session token groups the keystrokes of one search + the details fetch into
    // a single billable session (Google best practice); refreshed after each pick.
    const sessionToken = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
    const debounceTimer = useRef<NodeJS.Timeout | null>(null)

    // Load the Maps JS API + the Places library once, then mark ready.
    useEffect(() => {
        let isMounted = true

        const initService = async () => {
            try {
                await google.maps.importLibrary('places')
                if (isMounted) {
                    ready.current = true
                    sessionToken.current = new google.maps.places.AutocompleteSessionToken()
                }
            } catch (err) {
                console.error('Google Maps Places library init error:', err)
            }
        }

        const scriptId = 'google-maps-script'
        const callbackName = 'initGoogleMaps'
        ;(window as unknown as Record<string, () => void>)[callbackName] = () => { void initService() }

        if (document.getElementById(scriptId)) {
            // Script already present (e.g. remounted) — init directly once loaded.
            if (window.google?.maps) void initService()
        } else {
            const script = document.createElement('script')
            script.id = scriptId
            script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY}&libraries=places&v=weekly&loading=async&callback=${callbackName}`
            script.async = true
            script.defer = true
            document.head.appendChild(script)
        }

        return () => { isMounted = false }
    }, [])

    // Debounced autocomplete via the new AutocompleteSuggestion API.
    const searchPlaces = useCallback(async (searchQuery: string) => {
        if (!searchQuery || !ready.current) {
            setPredictions([])
            return
        }
        setIsLoading(true)
        try {
            const { suggestions } = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
                input: searchQuery,
                includedRegionCodes: ['ph'],
                sessionToken: sessionToken.current ?? undefined,
            })
            const mapped: Suggestion[] = suggestions
                .map((s) => s.placePrediction)
                .filter((p): p is google.maps.places.PlacePrediction => p != null)
                .map((p) => ({
                    placeId: p.placeId,
                    mainText: p.mainText?.text ?? p.text.text,
                    secondaryText: p.secondaryText?.text ?? '',
                    prediction: p,
                }))
            setPredictions(mapped)
            setShowPredictions(mapped.length > 0)
        } catch (err) {
            console.error('Autocomplete error:', err)
            setPredictions([])
        } finally {
            setIsLoading(false)
        }
    }, [])

    // Handle input change with a 400ms debounce.
    const handleInputChange = (value: string) => {
        setQuery(value)
        if (debounceTimer.current) clearTimeout(debounceTimer.current)
        debounceTimer.current = setTimeout(() => { void searchPlaces(value) }, 400)
    }

    const handlePlaceSelect = async (suggestion: Suggestion) => {
        setQuery(suggestion.mainText)
        setShowPredictions(false)
        setIsLoading(true)
        try {
            const place = suggestion.prediction.toPlace()
            await place.fetchFields({
                fields: ['displayName', 'formattedAddress', 'location', 'addressComponents'],
            })

            let city = ''
            const cityComponent = place.addressComponents?.find(
                (c) => c.types.includes('locality') || c.types.includes('administrative_area_level_2')
            )
            if (cityComponent?.longText) city = cityComponent.longText

            // location may be a LatLng (methods) or a LatLngLiteral (plain numbers).
            const toNum = (v: number | (() => number) | undefined | null) =>
                typeof v === 'function' ? v() : (v ?? 0)
            const loc = place.location
            const latitude = toNum(loc?.lat)
            const longitude = toNum(loc?.lng)

            const result: PlaceResult = {
                address: place.formattedAddress || suggestion.mainText,
                city: city || 'Manila',
                latitude,
                longitude,
                venue_name: place.displayName ?? undefined,
            }
            onPlaceSelected(result)
        } catch (err) {
            console.error('Place details error:', err)
        } finally {
            setIsLoading(false)
            // Fresh token starts a new billable session for the next search.
            sessionToken.current = new google.maps.places.AutocompleteSessionToken()
        }
    }

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current)
        }
    }, [])

    return (
        <div className="relative">
            <Label htmlFor="address">Address *</Label>
            <div className="relative">
                <Input
                    id="address"
                    value={query}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onFocus={() => predictions.length > 0 && setShowPredictions(true)}
                    placeholder="Search for a location..."
                    className={error ? 'border-red-500' : ''}
                />
                {isLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
            </div>

            {/* Predictions Dropdown */}
            {showPredictions && predictions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto">
                    {predictions.map((prediction) => (
                        <button
                            key={prediction.placeId}
                            type="button"
                            className="w-full px-4 py-3 text-left hover:bg-muted transition-colors flex items-start gap-3"
                            onClick={() => handlePlaceSelect(prediction)}
                        >
                            <MapPin className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">
                                    {prediction.mainText}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                    {prediction.secondaryText}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
            <p className="text-xs text-muted-foreground mt-1">
                Start typing to search for a location
            </p>
        </div>
    )
}
