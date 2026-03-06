'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ShieldCheck } from 'lucide-react'

interface ExperienceHostSectionProps {
    hostName: string
    hostBio?: string | null
    hostAvatarUrl?: string | null
    verifiedByHanghut?: boolean
}

export function ExperienceHostSection({
    hostName,
    hostBio,
    hostAvatarUrl,
    verifiedByHanghut,
}: ExperienceHostSectionProps) {
    const [expanded, setExpanded] = useState(false)

    return (
        <div className="flex items-start gap-4 py-6 border-y border-border/50">
            {/* Avatar */}
            <div className="relative shrink-0 w-16 h-16 rounded-full overflow-hidden border-2 border-background shadow-md bg-muted">
                {hostAvatarUrl ? (
                    <Image
                        src={hostAvatarUrl}
                        alt={hostName}
                        fill
                        className="object-cover"
                    />
                ) : (
                    <div className="w-full h-full bg-primary/20 flex items-center justify-center">
                        <span className="text-2xl font-bold text-primary">
                            {hostName?.charAt(0).toUpperCase()}
                        </span>
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground mb-0.5">Hosted by</p>
                <h3 className="text-lg font-bold flex items-center gap-2 flex-wrap">
                    {hostName}
                    {verifiedByHanghut && (
                        <span
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full"
                            title="Verified by HangHut"
                        >
                            <ShieldCheck className="h-3 w-3" />
                            Verified
                        </span>
                    )}
                </h3>

                {hostBio && (
                    <div className="mt-2">
                        <p
                            className={`text-sm text-muted-foreground leading-relaxed ${expanded ? '' : 'line-clamp-3'
                                }`}
                        >
                            {hostBio}
                        </p>
                        {hostBio.length > 150 && (
                            <button
                                onClick={() => setExpanded(!expanded)}
                                className="mt-1 text-sm font-medium text-primary hover:underline"
                            >
                                {expanded ? 'Show less' : 'Show more'}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
