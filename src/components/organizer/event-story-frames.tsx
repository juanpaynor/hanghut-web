'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { Loader2, Upload, Trash2, CheckCircle2, Clock, XCircle, Power, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
    validateFrameFile, resizeFrameFile, FRAME_WIDTH, FRAME_HEIGHT, SAFE_TOP, SAFE_BOTTOM,
    type FrameValidation,
} from '@/lib/frames/validate-frame'
import {
    listEventFrames, createEventFrame, setEventFrameActive, deleteEventFrame,
    type EventFrame,
} from '@/lib/frames/actions'

/** A stand-in for the user's photo, so the preview is never a checkerboard. */
const PREVIEW_PHOTO =
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=540&h=960&fit=crop'

export function EventStoryFrames({ eventId, coverImageUrl }: {
    eventId: string
    coverImageUrl?: string | null
}) {
    const [frames, setFrames] = useState<EventFrame[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()
    const [name, setName] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [issues, setIssues] = useState<string[]>([])
    const [uploading, setUploading] = useState(false)
    // The file we turned away, kept only so we can offer to resize it rather
    // than making the organizer go back to their design tool for a crop.
    const [rejected, setRejected] = useState<{ file: File; check: FrameValidation } | null>(null)
    const [resizing, setResizing] = useState(false)
    const [notice, setNotice] = useState<string | null>(null)
    const fileRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        listEventFrames(eventId)
            .then(setFrames)
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false))
    }, [eventId])

    // An object URL is a document-lifetime handle; without this every file the
    // organizer tries leaks one until the tab closes.
    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

    async function pick(f: File | null) {
        setIssues([])
        setNotice(null)
        setRejected(null)
        setFile(null)
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        setPreviewUrl(null)
        if (!f) return

        const result = await validateFrameFile(f)
        if (!result.ok) {
            setIssues(result.errors)
            if (result.canResize) setRejected({ file: f, check: result })
            return
        }

        accept(f, f.name, null)
    }

    /** Name comes from the SOURCE file, so a resize does not rename the frame. */
    function accept(f: File, nameSource: string, note: string | null) {
        setFile(f)
        setPreviewUrl(URL.createObjectURL(f))
        setNotice(note)
        setName((n) => (n.trim() ? n : nameSource.replace(/\.png$/i, '').slice(0, 60)))
    }

    /**
     * Redraw the rejected file at 1080x1920 in the browser.
     *
     * Re-validated afterwards rather than assumed fixed: fewer pixels usually
     * means fewer bytes, but canvas PNG output is unoptimised, so a heavy frame
     * can come back still over 2 MB. If it does, the organizer sees that instead
     * of a silent success.
     */
    async function resize() {
        const source = rejected
        if (!source) return
        setResizing(true)
        setError(null)
        try {
            const resized = await resizeFrameFile(source.file)
            const check = await validateFrameFile(resized)
            if (!check.ok) {
                setIssues(check.errors)
                setRejected(null)
                return
            }
            setIssues([])
            setRejected(null)
            accept(
                resized,
                source.file.name,
                `Resized from ${source.check.width}×${source.check.height} to ${FRAME_WIDTH}×${FRAME_HEIGHT}` +
                    (source.check.aspectMatches
                        ? '. Nothing was cropped.'
                        : ' and padded with transparency, so nothing was cropped or stretched. Check the preview.'),
            )
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not resize that PNG')
        } finally {
            setResizing(false)
        }
    }

    async function upload() {
        if (!file) return
        setUploading(true)
        setError(null)
        try {
            // Browser-direct to storage: a 2 MB PNG has no business travelling
            // through a server action body.
            const supabase = createClient()
            const path = `${eventId}/${crypto.randomUUID()}.png`
            const { error: upErr } = await supabase.storage
                .from('event-frames')
                .upload(path, file, { contentType: 'image/png', upsert: false })
            if (upErr) throw new Error(upErr.message)

            const { data: urlData } = supabase.storage.from('event-frames').getPublicUrl(path)
            const created = await createEventFrame({
                eventId, name: name.trim(), imageUrl: urlData.publicUrl,
            })
            setFrames((f) => [created, ...f])
            setFile(null); setName(''); setNotice(null); setRejected(null)
            if (previewUrl) URL.revokeObjectURL(previewUrl)
            setPreviewUrl(null)
            if (fileRef.current) fileRef.current.value = ''
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Upload failed')
        } finally {
            setUploading(false)
        }
    }

    function toggle(frame: EventFrame) {
        setError(null)
        startTransition(async () => {
            try {
                await setEventFrameActive(frame.id, eventId, !frame.is_active)
                setFrames((all) => all.map((f) =>
                    f.id === frame.id
                        ? { ...f, is_active: !frame.is_active }
                        // One active per event, so activating stands the others down.
                        : frame.is_active ? f : { ...f, is_active: false },
                ))
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not change the frame')
            }
        })
    }

    function remove(frame: EventFrame) {
        startTransition(async () => {
            try {
                await deleteEventFrame(frame.id, eventId)
                setFrames((all) => all.filter((f) => f.id !== frame.id))
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not delete the frame')
            }
        })
    }

    return (
        <div className="rounded-xl border bg-card p-5">
            <h3 className="text-base font-semibold">Story frame</h3>
            <p className="mt-1 text-sm text-muted-foreground">
                A transparent PNG your attendees can put over their own photo and post to
                their story. {FRAME_WIDTH}×{FRAME_HEIGHT} and under 2&nbsp;MB — if yours is
                bigger we can resize it for you. Keep artwork out of the shaded bands —
                Instagram&apos;s own buttons sit there.
            </p>

            <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,1fr)_240px]">
                <div>
                    <label className="mb-1.5 block text-sm font-medium">Name</label>
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Opening night"
                        maxLength={60}
                    />

                    <label className="mb-1.5 mt-4 block text-sm font-medium">Artwork</label>
                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/png"
                        onChange={(e) => pick(e.target.files?.[0] ?? null)}
                        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium"
                    />

                    {issues.length > 0 && (
                        <ul className="mt-3 space-y-1">
                            {issues.map((i) => (
                                <li key={i} className="flex gap-2 text-sm text-destructive">
                                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />{i}
                                </li>
                            ))}
                        </ul>
                    )}

                    {rejected?.check.canResize && (
                        <div className="mt-3 rounded-lg border border-dashed p-3">
                            <p className="text-sm">
                                {rejected.check.aspectMatches
                                    ? 'That is already the right shape, just bigger. We can resize it here.'
                                    : 'We can resize it here, fitted inside the frame so nothing is cropped or stretched.'}
                            </p>
                            <Button
                                size="sm"
                                variant="secondary"
                                className="mt-2"
                                onClick={resize}
                                disabled={resizing}
                            >
                                {resizing
                                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    : <Wand2 className="mr-2 h-4 w-4" />}
                                Resize to {FRAME_WIDTH}×{FRAME_HEIGHT}
                            </Button>
                        </div>
                    )}

                    {notice && (
                        <p className="mt-3 flex gap-2 text-sm text-emerald-600">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                            {notice}
                        </p>
                    )}

                    {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

                    <Button
                        onClick={upload}
                        disabled={!file || !name.trim() || uploading}
                        className="mt-4"
                    >
                        {uploading
                            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            : <Upload className="mr-2 h-4 w-4" />}
                        Upload for review
                    </Button>
                    <p className="mt-2 text-xs text-muted-foreground">
                        Frames are reviewed before they go live.
                    </p>
                </div>

                <FramePreview frameUrl={previewUrl} photoUrl={coverImageUrl || PREVIEW_PHOTO} />
            </div>

            <div className="mt-6 border-t pt-5">
                <h4 className="text-sm font-medium">Frames</h4>
                {loading ? (
                    <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading
                    </p>
                ) : frames.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">No frames yet.</p>
                ) : (
                    <ul className="mt-3 space-y-2">
                        {frames.map((f) => (
                            <li key={f.id} className="flex items-center gap-3 rounded-lg border p-3">
                                <div className="relative h-14 w-8 shrink-0 overflow-hidden rounded bg-muted">
                                    <Image src={f.image_url} alt="" fill sizes="32px" className="object-cover" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{f.name}</p>
                                    <StatusChip status={f.status} active={f.is_active} />
                                </div>
                                <Button
                                    size="sm"
                                    variant={f.is_active ? 'default' : 'outline'}
                                    onClick={() => toggle(f)}
                                    disabled={pending || (f.status !== 'approved' && !f.is_active)}
                                    title={f.status !== 'approved' && !f.is_active
                                        ? 'Not approved yet'
                                        : f.is_active ? 'Take it down now' : 'Make it live'}
                                >
                                    <Power className="mr-1.5 h-3.5 w-3.5" />
                                    {f.is_active ? 'Live' : 'Off'}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => remove(f)} disabled={pending}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}

function StatusChip({ status, active }: { status: EventFrame['status']; active: boolean }) {
    if (active) {
        return (
            <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                <CheckCircle2 className="h-3 w-3" /> Live on this event
            </span>
        )
    }
    const map = {
        pending: { icon: Clock, label: 'Waiting for review', cls: 'text-amber-600' },
        approved: { icon: CheckCircle2, label: 'Approved, not live', cls: 'text-muted-foreground' },
        rejected: { icon: XCircle, label: 'Rejected', cls: 'text-destructive' },
    }[status]
    const Icon = map.icon
    return (
        <span className={cn('mt-0.5 inline-flex items-center gap-1 text-xs', map.cls)}>
            <Icon className="h-3 w-3" /> {map.label}
        </span>
    )
}

/**
 * The frame over a real photo at true 9:16, with Instagram's chrome drawn in.
 *
 * Over a photo rather than a checkerboard deliberately: a transparent PNG on a
 * checkerboard tells you nothing about whether the design reads against an
 * actual image, which is the only place it will ever be seen.
 */
function FramePreview({ frameUrl, photoUrl }: { frameUrl: string | null; photoUrl: string }) {
    const topPct = (SAFE_TOP / FRAME_HEIGHT) * 100
    const bottomPct = (SAFE_BOTTOM / FRAME_HEIGHT) * 100

    return (
        <div>
            <p className="mb-1.5 text-sm font-medium">Preview</p>
            <div className="relative aspect-[9/16] w-full overflow-hidden rounded-xl border bg-muted">
                <Image src={photoUrl} alt="" fill sizes="240px" className="object-cover" unoptimized />
                {frameUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={frameUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
                )}
                <div
                    className="pointer-events-none absolute inset-x-0 top-0 bg-black/45"
                    style={{ height: `${topPct}%` }}
                />
                <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/45"
                    style={{ height: `${bottomPct}%` }}
                />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
                Shaded bands are covered by Instagram&apos;s buttons.
            </p>
        </div>
    )
}
