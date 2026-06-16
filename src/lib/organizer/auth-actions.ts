'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * registerPartner — minimal account creation.
 *
 * Signup only creates the account + light business identity. ALL KYC (DOB,
 * documents, stakeholders, address, TIN, etc.) is collected later in the
 * dashboard verification flow (the system of record). representative_name +
 * contact_number are kept so that flow can prefill the authorized person.
 */
export async function registerPartner(formData: FormData) {
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const businessName = formData.get('businessName') as string
    const businessType = formData.get('businessType') as string
    const representativeName = formData.get('representativeName') as string
    const phoneNumber = formData.get('phoneNumber') as string

    if (!email || !password || !businessName || !businessType) {
        return { error: 'Please complete all required fields.' }
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceRoleKey || !supabaseUrl) {
        return { error: 'Server configuration error: Missing service role key' }
    }

    const adminSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey)
    await createClient() // ensures cookie context is initialised

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
        .insert({ id: tempUserId, email, display_name: businessName })

    if (userCreateError) {
        console.error('Error pre-creating user:', userCreateError)
        return { error: 'Failed to initialize user profile: ' + userCreateError.message }
    }

    // Step 3: Create auth user directly via Admin API (bypasses broken trigger)
    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: businessName, role: 'partner' },
    })

    if (authError) {
        await adminSupabase.from('users').delete().eq('id', tempUserId)
        return { error: authError.message }
    }
    if (!authData.user) {
        await adminSupabase.from('users').delete().eq('id', tempUserId)
        return { error: 'Something went wrong during sign up' }
    }

    // Step 4: Reconcile the public.users record with the real auth id
    if (authData.user.id !== tempUserId) {
        await adminSupabase.from('users').delete().eq('id', tempUserId)
        await adminSupabase.from('users').insert({
            id: authData.user.id,
            email,
            display_name: businessName,
        })
    }

    // Step 5: Create the partner record (account only — KYC done in dashboard).
    const { error: partnerError } = await adminSupabase
        .from('partners')
        .insert({
            id: crypto.randomUUID(),
            user_id: authData.user.id,
            business_name: businessName,
            business_type: businessType,
            status: 'pending',
            verified: false,
            pricing_model: 'standard',
            work_email: email,
            representative_name: representativeName || null,
            contact_number: phoneNumber || null,
            kyc_status: 'not_started',
        })

    if (partnerError) {
        console.error('Partner creation error:', partnerError)
        return { error: `Account created but failed to register partner profile: ${partnerError.message}` }
    }

    return { success: true }
}
