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

export function GooglePlacesAutocomplete({ onPlaceSelected, error }: GooglePlacesAutocompleteProps) {
    const [query, setQuery] = useState('')
    const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [showPredictions, setShowPredictions] = useState(false)
    const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null)
    const placesService = useRef<google.maps.places.PlacesService | null>(null)
    const debounceTimer = useRef<NodeJS.Timeout | null>(null)

    // Initialize Google Places services with retry
    useEffect(() => {
        const initService = () => {
            if (typeof window !== 'undefined' && window.google && window.google.maps && window.google.maps.places) {
                autocompleteService.current = new google.maps.places.AutocompleteService()
                // Create a dummy div for PlacesService (required by Google API)
                const dummyDiv = document.createElement('div')
                placesService.current = new google.maps.places.PlacesService(dummyDiv)
                return true
            }
            return false
        }

        if (!initService()) {
            const checkInterval = setInterval(() => {
                if (initService()) {
                    clearInterval(checkInterval)
                }
            }, 500) // Check every 500ms

            // Stop checking after 10 seconds
            const timeout = setTimeout(() => {
                clearInterval(checkInterval)
            }, 10000)

            return () => {
                clearInterval(checkInterval)
                clearTimeout(timeout)
            }
        }
    }, [])

    // Debounced search function
    const searchPlaces = useCallback((searchQuery: string) => {
        if (!searchQuery || !autocompleteService.current) {
            setPredictions([])
            return
        }

        setIsLoading(true)

        autocompleteService.current.getPlacePredictions(
            {
                input: searchQuery,
                componentRestrictions: { country: 'ph' }, // Restrict to Philippines
                types: ['establishment', 'geocode'], // Allow both places and addresses
            },
            (predictions, status) => {
                setIsLoading(false)
                if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
                    setPredictions(predictions)
                    setShowPredictions(true)
                } else {
                    setPredictions([])
                }
            }
        )
    }, [])

    // Handle input change with debounce
    const handleInputChange = (value: string) => {
        setQuery(value)

        // Clear previous timer
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current)
        }

        // Set new timer (500ms debounce)
        debounceTimer.current = setTimeout(() => {
            searchPlaces(value)
        }, 500)
    }

    // Handle place selection
    const handlePlaceSelect = (placeId: string, description: string) => {
        if (!placesService.current) return

        setQuery(description)
        setShowPredictions(false)
        setIsLoading(true)

        placesService.current.getDetails(
            {
                placeId,
                fields: ['name', 'formatted_address', 'geometry', 'address_components'],
            },
            (place, status) => {
                setIsLoading(false)
                if (status === google.maps.places.PlacesServiceStatus.OK && place) {
                    // Extract city from address components
                    let city = ''
                    const cityComponent = place.address_components?.find(
                        (component) =>
                            component.types.includes('locality') ||
                            component.types.includes('administrative_area_level_2')
                    )
                    if (cityComponent) {
                        city = cityComponent.long_name
                    }

                    const result: PlaceResult = {
                        address: place.formatted_address || description,
                        city: city || 'Manila', // Fallback to Manila
                        latitude: place.geometry?.location?.lat() || 0,
                        longitude: place.geometry?.location?.lng() || 0,
                        venue_name: place.name,
                    }

                    onPlaceSelected(result)
                }
            }
        )
    }

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current)
            }
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
                            key={prediction.place_id}
                            type="button"
                            className="w-full px-4 py-3 text-left hover:bg-muted transition-colors flex items-start gap-3"
                            onClick={() => handlePlaceSelect(prediction.place_id, prediction.description)}
                        >
                            <MapPin className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">
                                    {prediction.structured_formatting.main_text}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                    {prediction.structured_formatting.secondary_text}
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
