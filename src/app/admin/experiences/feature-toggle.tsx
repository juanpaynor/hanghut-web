'use client'

import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { setExperienceFeatured } from '@/lib/admin/event-controls'

/**
 * Star an experience into the /events hero carousel.
 *
 * The carousel is shared with events and capped at HERO_MAX between them, so
 * this can legitimately be refused — the server owns that check and returns a
 * message saying the hero is full. Optimistic, and reverts on refusal so the
 * star never shows a state the database doesn't have.
 */
export function ExperienceFeatureToggle({
    experienceId,
    featured,
}: {
    experienceId: string
    featured: boolean
}) {
    const [on, setOn] = useState(featured)
    const [saving, setSaving] = useState(false)
    const { toast } = useToast()

    useEffect(() => setOn(featured), [featured])

    const toggle = async () => {
        if (saving) return
        const next = !on
        setOn(next)
        setSaving(true)
        const res = await setExperienceFeatured(experienceId, next)
        setSaving(false)

        if ('error' in res) {
            setOn(!next)
            toast({ title: 'Could not update', description: res.error, variant: 'destructive' })
        } else {
            toast({
                title: next ? 'Added to hero' : 'Removed from hero',
                description: next
                    ? 'This experience now appears in the carousel on /events.'
                    : 'It no longer appears in the /events carousel.',
            })
        }
    }

    return (
        <button
            onClick={toggle}
            disabled={saving}
            title={on ? 'Remove from the /events hero' : 'Feature in the /events hero'}
            aria-pressed={on}
            className={`rounded p-1 transition-opacity hover:opacity-100 disabled:opacity-40 ${
                on ? 'opacity-100' : 'opacity-30'
            }`}
        >
            <Star className={`h-4 w-4 ${on ? 'text-yellow-500 fill-yellow-500' : 'text-slate-400'}`} />
            <span className="sr-only">{on ? 'Unfeature experience' : 'Feature experience'}</span>
        </button>
    )
}
