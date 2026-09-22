'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Upload, FileCheck2, X, FileText } from 'lucide-react'
import { createRegistrationUploadUrl } from '@/lib/events/registration-upload-actions'

/**
 * A file answer on a registration question.
 *
 * The bytes never pass through a server action — Next.js caps those bodies and
 * a phone photo of an ID is bigger than the cap. The server hands back a signed
 * upload URL for one server-chosen path, the browser PUTs to storage directly,
 * and the answer this produces is the JSON record of what landed there.
 *
 * Works signed-out, because that is how most people register.
 */

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,application/pdf'
const MAX_BYTES = 10 * 1024 * 1024

export interface StoredFile {
    path: string
    name: string
    size: number
    type: string
}

function prettySize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function RegistrationFileInput({
    eventId, questionId, value, onChange, disabled,
}: {
    eventId: string
    questionId: string
    /** The JSON string held in the answer, or '' when nothing is uploaded. */
    value: string
    onChange: (answer: string) => void
    disabled?: boolean
}) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    let stored: StoredFile | null = null
    try {
        if (value && value.trim().startsWith('{')) {
            const v = JSON.parse(value)
            if (v?.path) stored = v as StoredFile
        }
    } catch { /* a bad value just shows as "nothing uploaded" */ }

    async function handleFile(file: File) {
        setError(null)

        // Check here as well as on the server: it is the difference between an
        // instant message and a wasted 10MB round trip on a phone connection.
        if (file.size > MAX_BYTES) {
            setError('That file is over 10MB. Try a smaller photo.')
            return
        }

        setBusy(true)
        try {
            const ticket = await createRegistrationUploadUrl(
                eventId, questionId, file.name, file.type, file.size,
            )
            if (ticket.error || !ticket.path || !ticket.token) {
                setError(ticket.error || 'Could not start the upload.')
                return
            }

            const supabase = createClient()
            const { error: upErr } = await supabase.storage
                .from('registration-uploads')
                .uploadToSignedUrl(ticket.path, ticket.token, file, {
                    contentType: file.type,
                })
            if (upErr) {
                setError(upErr.message || 'Upload failed. Try again.')
                return
            }

            onChange(JSON.stringify({
                path: ticket.path,
                name: file.name,
                size: file.size,
                type: file.type,
            } satisfies StoredFile))
        } catch (e: any) {
            setError(e?.message || 'Upload failed. Try again.')
        } finally {
            setBusy(false)
            if (inputRef.current) inputRef.current.value = ''
        }
    }

    if (stored) {
        return (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                <FileCheck2 className="h-4 w-4 shrink-0 text-green-600" />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{stored.name}</p>
                    <p className="text-[11px] text-muted-foreground">{prettySize(stored.size)} · uploaded</p>
                </div>
                <Button
                    type="button" variant="ghost" size="sm" className="h-7 px-2 shrink-0"
                    disabled={disabled || busy}
                    onClick={() => { onChange(''); setError(null) }}
                >
                    <X className="h-3.5 w-3.5" />
                    <span className="sr-only">Remove file</span>
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-1.5">
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                disabled={disabled || busy}
                onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFile(f)
                }}
            />
            <Button
                type="button"
                variant="outline"
                className="w-full justify-start font-normal"
                disabled={disabled || busy}
                onClick={() => inputRef.current?.click()}
            >
                {busy
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading…</>
                    : <><Upload className="h-4 w-4 mr-2" />Choose a file</>}
            </Button>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <FileText className="h-3 w-3 shrink-0" />
                JPG, PNG, WEBP, HEIC or PDF · up to 10MB
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
    )
}
