'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Paperclip, ExternalLink, FileText, ImageOff } from 'lucide-react'
import { getRegistrationFileUrl } from '@/lib/events/registration-upload-actions'

/**
 * An uploaded file answer.
 *
 * The bucket is private, so there is no URL until one is minted. The parent
 * mints a page's worth in one batch and passes the matching one in as `url` —
 * images then render inline, which is the point: an organizer checking 25 IDs
 * should not have to click 25 times.
 *
 * Without a `url` (batch failed, link expired, PDF) it falls back to the
 * click-to-open button, which mints its own on demand.
 */

interface ParsedFile { path: string; name: string; size?: number; type?: string }

function parse(raw: unknown): ParsedFile | null {
    try {
        const s = typeof raw === 'string' ? raw : ''
        if (!s.trim().startsWith('{')) return null
        const v = JSON.parse(s)
        return v?.path ? (v as ParsedFile) : null
    } catch {
        return null
    }
}

export function RegistrationFileLink({
    eventId, raw, url,
}: {
    eventId: string
    raw: unknown
    /** Pre-minted signed URL from the page batch, when available. */
    url?: string
}) {
    const { toast } = useToast()
    const [busy, setBusy] = useState(false)
    const [imgFailed, setImgFailed] = useState(false)

    const file = parse(raw)
    if (!file) return null

    // HEIC is accepted on upload (iPhones produce it) but most browsers will not
    // display it, so it is treated as a document rather than shown as a broken
    // image. PDFs likewise.
    const isViewableImage = !!file.type
        && file.type.startsWith('image/')
        && file.type !== 'image/heic'

    async function open() {
        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer')
            return
        }
        setBusy(true)
        const res = await getRegistrationFileUrl(eventId, file!.path)
        setBusy(false)
        if (res.error || !res.url) {
            toast({ title: 'Could not open file', description: res.error, variant: 'destructive' })
            return
        }
        window.open(res.url, '_blank', 'noopener,noreferrer')
    }

    if (isViewableImage && url && !imgFailed) {
        return (
            <button
                type="button"
                onClick={open}
                className="group mt-1.5 block overflow-hidden rounded-lg border bg-background transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={`${file.name} — click to open full size`}
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={url}
                    alt={file.name}
                    loading="lazy"
                    onError={() => setImgFailed(true)}
                    className="max-h-48 w-auto max-w-full object-contain"
                />
                <span className="flex items-center gap-1.5 border-t px-2 py-1 text-[11px] text-muted-foreground">
                    <Paperclip className="h-3 w-3 shrink-0" />
                    <span className="truncate">{file.name}</span>
                    <ExternalLink className="ml-auto h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
                </span>
            </button>
        )
    }

    return (
        <Button
            variant="outline" size="sm" className="mt-1 h-7 text-xs"
            onClick={open} disabled={busy}
        >
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                : imgFailed ? <ImageOff className="mr-1.5 h-3.5 w-3.5" />
                    : isViewableImage ? <Paperclip className="mr-1.5 h-3.5 w-3.5" />
                        : <FileText className="mr-1.5 h-3.5 w-3.5" />}
            <span className="max-w-[180px] truncate">{file.name}</span>
            <ExternalLink className="ml-1.5 h-3 w-3 shrink-0 opacity-60" />
        </Button>
    )
}

/** Pull every file path out of a page of answers, for the batch call. */
export function collectFilePaths(
    registrations: { answers: { answer: unknown }[] }[],
): string[] {
    const paths: string[] = []
    for (const reg of registrations) {
        for (const a of reg.answers) {
            const f = parse(a.answer)
            if (f) paths.push(f.path)
        }
    }
    return paths
}

export { parse as parseFileAnswerClient }
