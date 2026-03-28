'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

/**
 * Helper to upload a KYC document to Supabase Storage
 */
async function uploadKYCDocument(
    adminSupabase: any,
    partnerId: string,
    file: File,
    folder: string
): Promise<string | null> {
    if (!file || file.size === 0) return null

    const ext = file.name.split('.').pop() || 'file'
    const fileName = `${partnerId}/${folder}-${Date.now()}.${ext}`

    const { data, error } = await adminSupabase.storage
        .from('kyc-documents')
        .upload(fileName, file, {
            upsert: true,
            contentType: file.type
        })

    if (error) {
        console.error(`Failed to upload ${folder}:`, error)
        return null
    }

    return data.path
}

export async function registerPartner(formData: FormData) {
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const businessName = formData.get('businessName') as string
    const businessType = formData.get('businessType') as string
    const taxId = formData.get('taxId') as string | null
    const registrationNumber = formData.get('registrationNumber') as string | null
    const representativeName = formData.get('representativeName') as string
    const phoneNumber = formData.get('phoneNumber') as string
    const birthdate = formData.get('birthdate') as string
    const sex = formData.get('sex') as string
    const nationality = formData.get('nationality') as string | null
    const placeOfBirth = formData.get('placeOfBirth') as string | null

    // Address fields (optional)
    const streetLine1 = formData.get('streetLine1') as string | null
    const streetLine2 = formData.get('streetLine2') as string | null
    const city = formData.get('city') as string | null
    const provinceState = formData.get('provinceState') as string | null
    const postalCode = formData.get('postalCode') as string | null
    const origin = (await headers()).get('origin')

    // File uploads (optional at registration)
    const idDocumentFile = formData.get('idDocument') as File | null
    const businessDocumentFile = formData.get('businessDocument') as File | null
    const bir2303File = formData.get('bir2303') as File | null
    // Corporation-specific docs
    const articlesFile = formData.get('articlesOfIncorporation') as File | null
    const secretaryCertFile = formData.get('secretaryCertificate') as File | null
    const gisFile = formData.get('latestGIS') as File | null

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

    // Step 5: Create a temporary partner ID for file uploads
    const partnerId = crypto.randomUUID()

    // Step 6: Upload KYC documents (if provided)
    let idDocumentUrl: string | null = null
    let businessDocumentUrl: string | null = null
    let bir2303Url: string | null = null

    if (idDocumentFile && idDocumentFile.size > 0) {
        idDocumentUrl = await uploadKYCDocument(adminSupabase, partnerId, idDocumentFile, 'id-document')
    }
    if (businessDocumentFile && businessDocumentFile.size > 0) {
        businessDocumentUrl = await uploadKYCDocument(adminSupabase, partnerId, businessDocumentFile, 'business-document')
    }
    if (bir2303File && bir2303File.size > 0) {
        bir2303Url = await uploadKYCDocument(adminSupabase, partnerId, bir2303File, 'bir-2303')
    }

    // Corporation-specific docs
    let articlesUrl: string | null = null
    let secretaryCertUrl: string | null = null
    let gisUrl: string | null = null

    if (articlesFile && articlesFile.size > 0) {
        articlesUrl = await uploadKYCDocument(adminSupabase, partnerId, articlesFile, 'articles-of-incorporation')
    }
    if (secretaryCertFile && secretaryCertFile.size > 0) {
        secretaryCertUrl = await uploadKYCDocument(adminSupabase, partnerId, secretaryCertFile, 'secretary-certificate')
    }
    if (gisFile && gisFile.size > 0) {
        gisUrl = await uploadKYCDocument(adminSupabase, partnerId, gisFile, 'latest-gis')
    }

    // Step 7: Create the partner record with KYC data
    console.log('Creating partner record for user:', authData.user.id)
    const { error: partnerError } = await adminSupabase
        .from('partners')
        .insert({
            id: partnerId,
            user_id: authData.user.id,
            business_name: businessName,
            business_type: businessType,
            status: 'pending',
            verified: false,
            pricing_model: 'standard',
            work_email: email,
            representative_name: representativeName || null,
            contact_number: phoneNumber || null,
            nationality: nationality || null,
            place_of_birth: placeOfBirth || null,
            street_line1: streetLine1 || null,
            street_line2: streetLine2 || null,
            city: city || null,
            province_state: provinceState || null,
            postal_code: postalCode || null,
            tax_id: taxId || null,
            registration_number: registrationNumber || null,
            id_document_url: idDocumentUrl,
            business_document_url: businessDocumentUrl,
            bir_2303_url: bir2303Url,
            articles_of_incorporation_url: articlesUrl,
            secretary_certificate_url: secretaryCertUrl,
            latest_gis_url: gisUrl,
            kyc_status: (idDocumentUrl || businessDocumentUrl || bir2303Url) ? 'submitted' : 'not_started',
        })

    if (partnerError) {
        console.error('Partner creation error:', partnerError)
        return { error: `Account created but failed to register partner profile: ${partnerError.message}` }
    }

    console.log('✅ Partner record created successfully with KYC documents')
    return { success: true }
}

