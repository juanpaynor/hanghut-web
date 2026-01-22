'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export async function registerPartner(formData: FormData) {
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const businessName = formData.get('businessName') as string
    const businessType = formData.get('businessType') as string
    const origin = (await headers()).get('origin')

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) {
        return { error: 'Server configuration error: Missing service role key' }
    }

    const adminSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey)
    const supabase = await createClient() // Regular client for auth.signUp

    // WORKAROUND FOR BROKEN TRIGGER:
    // Step 1: Check if email already exists
    const { data: existingUser } = await adminSupabase
        .from('users')
        .select('id, email')
        .eq('email', email)
        .single()

    if (existingUser) {
        return { error: 'An account with this email already exists. Please use a different email or try logging in.' }
    }

    // Step 2: Pre-create the public.users record BEFORE auth signup
    const tempUserId = crypto.randomUUID()

    const { error: userCreateError } = await adminSupabase
        .from('users')
        .insert({
            id: tempUserId,
            email,
            display_name: businessName,
        })

    if (userCreateError) {
        console.error('Error pre-creating user:', userCreateError)
        return { error: 'Failed to initialize user profile: ' + userCreateError.message }
    }

    // Step 3: Create auth user directly via Admin API (bypasses broken trigger entirely)
    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
            display_name: businessName,
            role: 'partner',
        }
    })

    if (authError) {
        console.error('Registration auth error:', authError)
        // Cleanup the pre-created user if auth fails
        await adminSupabase.from('users').delete().eq('id', tempUserId)
        return { error: authError.message }
    }

    if (!authData.user) {
        await adminSupabase.from('users').delete().eq('id', tempUserId)
        return { error: 'Something went wrong during sign up' }
    }

    // Step 4: Update the public.users record with the correct auth ID
    if (authData.user.id !== tempUserId) {
        // Delete temp record and create new one with correct ID
        await adminSupabase.from('users').delete().eq('id', tempUserId)
        await adminSupabase.from('users').insert({
            id: authData.user.id,
            email,
            display_name: businessName,
        })
    }

    // Step 5: Create the partner record
    console.log('Creating partner record for user:', authData.user.id)
    const { error: partnerError } = await adminSupabase
        .from('partners')
        .insert({
            user_id: authData.user.id,
            business_name: businessName,
            business_type: businessType,
            status: 'pending',
            verified: false,
            pricing_model: 'standard'
        })

    if (partnerError) {
        console.error('Partner creation error:', partnerError)
        return { error: `Account created but failed to register partner profile: ${partnerError.message}` }
    }

    console.log('✅ Partner record created successfully')
    return { success: true }
}
