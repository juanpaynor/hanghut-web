'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

/**
 * Helper to upload a KYC document to Supabase Storage
 */
async function uploadKYCDocument(
    adminSupabase: any,
    userId: string,
    file: File,
    folder: string
): Promise<string | null> {
    if (!file || file.size === 0) return null
    if (file.size > 10 * 1024 * 1024) throw new Error(`${folder} file too large (max 10MB)`)

    const ext = file.name.split('.').pop() || 'file'
    const fileName = `${userId}/${folder}-${Date.now()}.${ext}`

    const { data, error } = await adminSupabase.storage
        .from('kyc-documents')
        .upload(fileName, file, {
            upsert: true,
            contentType: file.type
        })

    if (error) {
        console.error(`Failed to upload ${folder}:`, error)
        throw new Error(`Failed to upload ${folder}: ${error.message}`)
    }

    return data.path
}

export type KYCFormState = {
    errors?: Record<string, string[]>
    message?: string
    success?: boolean
}

export async function submitKYCVerification(
    prevState: KYCFormState | undefined,
    formData: FormData
): Promise<KYCFormState> {
    const supabase = await createClient()

    // 1. Auth Check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { message: 'Unauthorized session.' }
    }

    // 2. Get existing partner record
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceRoleKey || !supabaseUrl) return { message: 'Server Config Error' }

    const adminSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey)

    const { data: partner } = await adminSupabase
        .from('partners')
        .select('id, business_type')
        .eq('user_id', user.id)
        .single()

    if (!partner) {
        return { message: 'Partner profile not found.' }
    }

    // 3. Extract form fields
    const representativeName = formData.get('representativeName') as string
    const phoneNumber = formData.get('phoneNumber') as string
    const birthdate = formData.get('birthdate') as string
    const sex = formData.get('sex') as string
    const nationality = formData.get('nationality') as string
    const placeOfBirth = formData.get('placeOfBirth') as string
    const businessType = formData.get('businessType') as string

    // Address
    const streetLine1 = formData.get('streetLine1') as string | null
    const streetLine2 = formData.get('streetLine2') as string | null
    const city = formData.get('city') as string | null
    const provinceState = formData.get('provinceState') as string | null
    const postalCode = formData.get('postalCode') as string | null

    // Tax/Registration
    const taxId = formData.get('taxId') as string | null
    const registrationNumber = formData.get('registrationNumber') as string | null

    // 4. Validate required fields
    const errors: Record<string, string[]> = {}
    if (!representativeName?.trim()) errors.representativeName = ['Representative name is required']
    if (!phoneNumber?.trim()) errors.phoneNumber = ['Phone number is required']
    if (!birthdate) errors.birthdate = ['Date of birth is required']
    if (!sex) errors.sex = ['Sex is required']
    if (!nationality?.trim()) errors.nationality = ['Nationality is required']
    if (!placeOfBirth?.trim()) errors.placeOfBirth = ['Place of birth is required']
    if (!businessType) errors.businessType = ['Business type is required']

    if (Object.keys(errors).length > 0) {
        return { errors, message: 'Please check your inputs.' }
    }

    // 5. Upload documents
    const idDocumentFile = formData.get('idDocument') as File | null
    const businessDocumentFile = formData.get('businessDocument') as File | null
    const bir2303File = formData.get('bir2303') as File | null
    const articlesFile = formData.get('articlesOfIncorporation') as File | null
    const secretaryCertFile = formData.get('secretaryCertificate') as File | null
    const gisFile = formData.get('latestGIS') as File | null

    let idDocumentUrl: string | null = null
    let businessDocumentUrl: string | null = null
    let bir2303Url: string | null = null
    let articlesUrl: string | null = null
    let secretaryCertUrl: string | null = null
    let gisUrl: string | null = null

    try {
        if (idDocumentFile && idDocumentFile.size > 0) {
            idDocumentUrl = await uploadKYCDocument(adminSupabase, user.id, idDocumentFile, 'id-document')
        }
        if (businessDocumentFile && businessDocumentFile.size > 0) {
            businessDocumentUrl = await uploadKYCDocument(adminSupabase, user.id, businessDocumentFile, 'business-document')
        }
        if (bir2303File && bir2303File.size > 0) {
            bir2303Url = await uploadKYCDocument(adminSupabase, user.id, bir2303File, 'bir-2303')
        }
        if (articlesFile && articlesFile.size > 0) {
            articlesUrl = await uploadKYCDocument(adminSupabase, user.id, articlesFile, 'articles-of-incorporation')
        }
        if (secretaryCertFile && secretaryCertFile.size > 0) {
            secretaryCertUrl = await uploadKYCDocument(adminSupabase, user.id, secretaryCertFile, 'secretary-certificate')
        }
        if (gisFile && gisFile.size > 0) {
            gisUrl = await uploadKYCDocument(adminSupabase, user.id, gisFile, 'latest-gis')
        }
    } catch (error: any) {
        return { message: error.message || 'File upload failed.' }
    }

    // 6. Build update object (only include non-null uploads to avoid overwriting existing docs)
    const updateData: Record<string, any> = {
        representative_name: representativeName,
        contact_number: phoneNumber,
        business_type: businessType,
        nationality,
        place_of_birth: placeOfBirth,
        street_line1: streetLine1 || null,
        street_line2: streetLine2 || null,
        city: city || null,
        province_state: provinceState || null,
        postal_code: postalCode || null,
        tax_id: taxId || null,
        registration_number: registrationNumber || null,
        kyc_status: 'pending_review',
        kyc_rejection_reason: null,
    }

    // Only overwrite document URLs if new files were uploaded
    if (idDocumentUrl) updateData.id_document_url = idDocumentUrl
    if (businessDocumentUrl) updateData.business_document_url = businessDocumentUrl
    if (bir2303Url) updateData.bir_2303_url = bir2303Url
    if (articlesUrl) updateData.articles_of_incorporation_url = articlesUrl
    if (secretaryCertUrl) updateData.secretary_certificate_url = secretaryCertUrl
    if (gisUrl) updateData.latest_gis_url = gisUrl

    // 7. DB Update
    const { error: dbError } = await adminSupabase
        .from('partners')
        .update(updateData)
        .eq('user_id', user.id)

    if (dbError) {
        return { message: 'Database Update Failed: ' + dbError.message }
    }

    revalidatePath('/organizer/verification')
    return { message: 'Verification submitted successfully!', success: true }
}
