'use server'

import { createClient } from '@/lib/supabase/server'

export async function joinWaitlist(formData: { fullName: string; email: string }) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('waitlist')
        .insert({
            full_name: formData.fullName,
            email: formData.email,
            source: 'landing_page',
        })

    if (error) {
        // Duplicate email
        if (error.code === '23505') {
            return { success: false, error: 'You\'re already on the waitlist!' }
        }
        console.error('Waitlist insert error:', error)
        return { success: false, error: 'Something went wrong. Please try again.' }
    }

    return { success: true }
}

export async function getWaitlistEntries(page = 1, pageSize = 25) {
    const supabase = await createClient()

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data, error, count } = await supabase
        .from('waitlist')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to)

    if (error) {
        console.error('Error fetching waitlist:', error)
        return { entries: [], total: 0 }
    }

    return { entries: data || [], total: count || 0 }
}
