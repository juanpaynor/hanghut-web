'use client'

import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'
import type { WebScannerProps } from '@/components/scanner/web-scanner'

const WebScanner = dynamic(
    () => import('./web-scanner').then((mod) => mod.WebScanner),
    {
        ssr: false,
        loading: () => (
            <div className="flex flex-col items-center justify-center p-12 space-y-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading Scanner...</p>
            </div>
        )
    }
)

export function LazyWebScanner(props: WebScannerProps) {
    return <WebScanner {...props} />
}
