'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export interface ApkRelease {
    id: string
    version_name: string
    version_code: number
    file_url: string
    file_size_bytes: number
    release_notes: string | null
    is_latest: boolean
    uploaded_by: string | null
    created_at: string
}

export async function getApkReleases(): Promise<{ releases: ApkRelease[], total: number }> {
    const supabase = await createClient()

    const { data, error, count } = await supabase
        .from('apk_releases')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching APK releases:', error)
        return { releases: [], total: 0 }
    }

    return { releases: data || [], total: count || 0 }
}

export async function getLatestRelease(): Promise<ApkRelease | null> {
    const adminClient = createAdminClient()

    const { data, error } = await adminClient
        .from('apk_releases')
        .select('*')
        .eq('is_latest', true)
        .single()

    if (error || !data) return null
    return data
}

export async function uploadApkRelease(formData: FormData): Promise<{ success: boolean, error?: string }> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    const file = formData.get('file') as File
    const versionName = formData.get('version_name') as string
    const versionCode = parseInt(formData.get('version_code') as string)
    const releaseNotes = formData.get('release_notes') as string

    if (!file || !versionName || !versionCode) {
        return { success: false, error: 'Missing required fields' }
    }

    // Upload file to Supabase Storage
    const fileName = `hanghut-v${versionName}.apk`
    const { data: uploadData, error: uploadError } = await supabase.storage
        .from('apk-releases')
        .upload(fileName, file, {
            cacheControl: '3600',
            upsert: true,
        })

    if (uploadError) {
        console.error('APK upload error:', uploadError)
        return { success: false, error: 'Failed to upload file: ' + uploadError.message }
    }

    // Get public URL
    const { data: urlData } = supabase.storage
        .from('apk-releases')
        .getPublicUrl(uploadData.path)

    // Unset all existing "latest" flags
    await supabase
        .from('apk_releases')
        .update({ is_latest: false })
        .eq('is_latest', true)

    // Insert release record
    const { error: insertError } = await supabase
        .from('apk_releases')
        .insert({
            version_name: versionName,
            version_code: versionCode,
            file_url: urlData.publicUrl,
            file_size_bytes: file.size,
            release_notes: releaseNotes || null,
            is_latest: true,
            uploaded_by: user.id,
        })

    if (insertError) {
        console.error('APK insert error:', insertError)
        return { success: false, error: 'Failed to save release info: ' + insertError.message }
    }

    revalidatePath('/admin/releases')
    revalidatePath('/download')
    return { success: true }
}

export async function setLatestRelease(id: string): Promise<{ success: boolean, error?: string }> {
    const supabase = await createClient()

    // Unset all existing latest flags
    await supabase
        .from('apk_releases')
        .update({ is_latest: false })
        .eq('is_latest', true)

    // Set new latest
    const { error } = await supabase
        .from('apk_releases')
        .update({ is_latest: true })
        .eq('id', id)

    if (error) {
        console.error('Set latest error:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/admin/releases')
    revalidatePath('/download')
    return { success: true }
}

export async function deleteApkRelease(id: string): Promise<{ success: boolean, error?: string }> {
    const supabase = await createClient()

    // Get the release to find its file URL
    const { data: release } = await supabase
        .from('apk_releases')
        .select('file_url, version_name')
        .eq('id', id)
        .single()

    if (release) {
        // Delete file from storage
        const fileName = `hanghut-v${release.version_name}.apk`
        await supabase.storage
            .from('apk-releases')
            .remove([fileName])
    }

    // Delete record
    const { error } = await supabase
        .from('apk_releases')
        .delete()
        .eq('id', id)

    if (error) {
        console.error('Delete release error:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/admin/releases')
    revalidatePath('/download')
    return { success: true }
}
