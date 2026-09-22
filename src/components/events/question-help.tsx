'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Maximize2 } from 'lucide-react'

/**
 * Guidance attached to a registration question.
 *
 * Driven by a size chart: "Finisher shirt size" is unanswerable on its own, and
 * a link the buyer has to open in another tab gets skipped. So the chart sits
 * inline, small enough not to push the input off screen, and opens full size on
 * tap for anyone who actually needs to read the numbers.
 */
export function QuestionHelp({ text, imageUrl }: {
    text?: string | null
    imageUrl?: string | null
}) {
    const [zoomed, setZoomed] = useState(false)

    if (!text && !imageUrl) return null

    return (
        <div className="space-y-2">
            {text && <p className="text-xs leading-relaxed text-muted-foreground">{text}</p>}

            {imageUrl && (
                <>
                    <button
                        type="button"
                        onClick={() => setZoomed(true)}
                        className="group relative block overflow-hidden rounded-lg border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="Open the reference image full size"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={imageUrl}
                            alt="Reference for this question"
                            loading="lazy"
                            className="max-h-40 w-auto max-w-full object-contain"
                        />
                        <span className="absolute bottom-1 right-1 rounded bg-background/85 p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                            <Maximize2 className="h-3 w-3" />
                        </span>
                    </button>

                    <Dialog open={zoomed} onOpenChange={setZoomed}>
                        <DialogContent className="max-w-3xl p-2">
                            <DialogTitle className="sr-only">Reference image</DialogTitle>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={imageUrl}
                                alt="Reference for this question"
                                className="max-h-[80vh] w-full object-contain"
                            />
                        </DialogContent>
                    </Dialog>
                </>
            )}
        </div>
    )
}
