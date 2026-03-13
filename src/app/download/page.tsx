import { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Download, Shield, Smartphone } from 'lucide-react'
import { getLatestRelease } from '@/lib/admin/apk-actions'

export const metadata: Metadata = {
    title: 'Download HangHut for Android',
    description: 'Download the HangHut Android app. Find activities, share moments, and meet people you didn\'t know you needed.',
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export default async function DownloadPage() {
    const release = await getLatestRelease()

    return (
        <div className="min-h-screen bg-background flex flex-col">
            {/* Nav */}
            <header className="fixed top-0 z-50 w-full border-b border-white/10 bg-background/60 backdrop-blur-xl">
                <div className="container mx-auto px-6 md:px-12 flex h-20 max-w-7xl items-center justify-between">
                    <Link href="/" className="flex items-center space-x-3 group">
                        <div className="relative h-12 w-12 overflow-hidden transition-transform group-hover:scale-110">
                            <Image
                                src="/logo_transparent.png"
                                alt="HangHut Logo"
                                fill
                                className="object-contain"
                            />
                        </div>
                    </Link>
                    <Link
                        href="/"
                        className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Home
                    </Link>
                </div>
            </header>

            {/* Hero */}
            <main className="flex-1 flex items-center justify-center pt-20 px-6 pb-12">
                <div className="max-w-2xl mx-auto text-center space-y-10">
                    {/* Icon */}
                    <div className="animate-in fade-in zoom-in duration-700">
                        <div className="relative h-28 w-28 mx-auto mb-6">
                            <Image
                                src="/logo_transparent.png"
                                alt="HangHut"
                                fill
                                className="object-contain drop-shadow-2xl"
                            />
                        </div>
                    </div>

                    {/* Copy */}
                    <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 space-y-4">
                        <h1 className="text-5xl md:text-6xl font-extrabold font-headline tracking-tighter leading-[1.1]">
                            Get{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-500">
                                HangHut
                            </span>
                        </h1>
                        <p className="text-xl text-muted-foreground font-light max-w-md mx-auto leading-relaxed">
                            Find an activity. Share a moment. Leave with a good story — and people you didn't know you needed.
                        </p>
                    </div>

                    {/* Download Button */}
                    <div className="animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300 fill-mode-both">
                        {release ? (
                            <div className="space-y-4">
                                <a
                                    href={release.file_url}
                                    download
                                    className="inline-flex items-center gap-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-lg px-8 py-4 rounded-2xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all hover:scale-105 active:scale-[0.98]"
                                >
                                    <Download className="h-6 w-6" />
                                    Download for Android
                                </a>
                                <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                        <Smartphone className="h-4 w-4" />
                                        v{release.version_name}
                                    </span>
                                    <span>•</span>
                                    <span>{formatBytes(release.file_size_bytes)}</span>
                                    <span>•</span>
                                    <span>APK</span>
                                </div>

                                {/* Release Notes */}
                                {release.release_notes && (
                                    <div className="mt-6 bg-muted/30 border border-border/50 rounded-xl p-5 text-left max-w-md mx-auto">
                                        <h3 className="text-sm font-bold text-foreground mb-2">What&apos;s New</h3>
                                        <p className="text-sm text-muted-foreground whitespace-pre-line">
                                            {release.release_notes}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="bg-muted/30 border border-border/50 rounded-xl p-8 max-w-md mx-auto">
                                <Smartphone className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                                <p className="font-medium text-foreground">Coming Soon</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    The Android app is being prepared. Check back soon!
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Installation Guide */}
                    {release && (
                        <div className="animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-500 fill-mode-both">
                            <div className="bg-muted/20 border border-border/50 rounded-xl p-6 max-w-md mx-auto text-left space-y-3">
                                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                                    <Shield className="h-4 w-4 text-primary" />
                                    Installation Guide
                                </div>
                                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                                    <li>Tap the download button above</li>
                                    <li>Open the downloaded <strong>.apk</strong> file</li>
                                    <li>If prompted, enable &quot;Install from unknown sources&quot; in your device settings</li>
                                    <li>Follow the on-screen prompts to install</li>
                                </ol>
                            </div>
                        </div>
                    )}

                    {/* iOS Placeholder */}
                    <div className="animate-in fade-in duration-1000 delay-700 fill-mode-both pt-4">
                        <p className="text-sm text-muted-foreground/60">
                            🍎 iOS version coming soon to the App Store.
                        </p>
                    </div>
                </div>
            </main>
        </div>
    )
}
