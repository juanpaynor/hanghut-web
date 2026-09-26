import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
// Pinned, not floating `@2`: the float resolved to 2.113.0, whose postgrest-js
// submodule 404s on esm.sh, and every function using `@2` became undeployable
// with no change on our side.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.0'

/**
 * Mint a one-shot upload URL for a registration file answer.
 *
 * This exists because the web equivalent is a Next.js server action, which the
 * mobile app cannot call. Same three checks, same server-chosen path, reachable
 * over plain HTTP.
 *
 * WHY A SERVER MINTS THIS AT ALL:
 *   - The bucket is PRIVATE and has no storage policies. Nothing but the
 *     service role can write to it. That is deliberate: it holds uploaded IDs,
 *     and storage paths are guessable.
 *   - The person uploading is usually NOT signed in. Registration is open to
 *     guests on both platforms, so the flow cannot depend on a session.
 *   - The bytes must not pass through here. The caller PUTs them straight to
 *     storage with the returned token.
 *
 * So this is deliberately callable by anonymous clients. The protection is not
 * a session, it is the narrowness of what it grants: one path, for a question
 * that must genuinely exist on that event and be of type `file`. A caller
 * cannot name its own path or write anywhere else.
 */

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BUCKET = 'registration-uploads'
const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED = [
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf',
]

function extensionFor(type: string, fileName: string): string {
    const fromName = (String(fileName || '').match(/\.([a-z0-9]{1,5})$/i)?.[1] || '').toLowerCase()
    if (fromName) return fromName
    return type === 'application/pdf' ? 'pdf'
        : type === 'image/png' ? 'png'
            : type === 'image/webp' ? 'webp'
                : type === 'image/heic' ? 'heic'
                    : 'jpg'
}

function fail(code: string, message: string, status = 400) {
    return new Response(
        JSON.stringify({ success: false, error: { code, message } }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const body = await req.json().catch(() => null)
        if (!body) return fail('VALIDATION_ERROR', 'Expected a JSON body.')

        const { event_id, question_id, file_name, content_type, file_size } = body

        if (!event_id || !question_id) {
            return fail('VALIDATION_ERROR', 'event_id and question_id are required.')
        }
        if (!ALLOWED.includes(content_type)) {
            return fail('UNSUPPORTED_TYPE', 'That file type is not accepted. Use a JPG, PNG, WEBP, HEIC or PDF.')
        }
        const size = Number(file_size)
        if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
            return fail('FILE_TOO_LARGE', 'Files must be under 10MB.')
        }

        const admin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // The question must belong to THIS event and actually accept a file —
        // otherwise this endpoint is a free upload slot for any id someone
        // invents.
        const { data: question, error: qError } = await admin
            .from('registration_questions')
            .select('id, event_id, question_type')
            .eq('id', question_id)
            .eq('event_id', event_id)
            .maybeSingle()

        if (qError) {
            console.error('question lookup failed', qError)
            return fail('SERVER_ERROR', 'Could not start the upload.', 500)
        }
        if (!question) {
            return fail('QUESTION_NOT_FOUND', 'That question does not belong to this event.', 404)
        }
        if (question.question_type !== 'file') {
            return fail('NOT_A_FILE_QUESTION', 'That question does not take a file.')
        }

        // Path is server-chosen. Grouped by event so an organizer's uploads are
        // one prefix, and random so nothing is guessable from a registration id.
        const ext = extensionFor(content_type, file_name)
        const path = `${event_id}/${question_id}/${crypto.randomUUID()}.${ext}`

        const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path)
        if (error || !data) {
            console.error('createSignedUploadUrl failed', error)
            return fail('SERVER_ERROR', 'Could not start the upload.', 500)
        }

        return new Response(
            JSON.stringify({
                success: true,
                data: {
                    bucket: BUCKET,
                    path: data.path,
                    token: data.token,
                    signed_url: data.signedUrl,
                    // What to store in registration_answers.answer once the PUT
                    // succeeds — JSON inside the text column, same shape web writes.
                    answer_template: {
                        path: data.path,
                        name: String(file_name || 'file'),
                        size,
                        type: content_type,
                    },
                },
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    } catch (error) {
        console.error('registration-file-upload error', error)
        return fail('SERVER_ERROR', (error as Error)?.message || 'Internal Server Error', 500)
    }
})
