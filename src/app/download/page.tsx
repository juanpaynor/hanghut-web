import { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Download, Shield, Smartphone } from 'lucide-react'
import { getLatestRelease } from '@/lib/admin/apk-actions'

export const metadata: Metadata = {
    title: 'Download HangHut - Early Access',
    description: 'Download the HangHut app for iOS (TestFlight) and Android. Find activities, share moments, and meet people you didn\'t know you needed.',
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

                    {/* Downloads Container */}
                    <div className="animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300 fill-mode-both space-y-8">
                        
                        {/* iOS TestFlight Section */}
                        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 max-w-md mx-auto shadow-xl backdrop-blur-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 bg-blue-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                                Recommended
                            </div>
                            <div className="space-y-6">
                                <div className="flex justify-center">
                                    <div className="h-16 w-16 bg-blue-500/10 rounded-2xl flex items-center justify-center">
                                        <svg className="h-8 w-8 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91 1.63.16 3.09.81 3.98 2.13-3.4 2.08-2.84 7.03 2.01 8.94-.8 2-1.6 3.9-2.2 4.59zM15.53 6.1c.71-.87 1.2-2.12 1.07-3.35-1.07.05-2.39.73-3.13 1.62-.66.79-1.25 2.06-1.1 3.27 1.18.09 2.44-.67 3.16-1.54z"/>
                                        </svg>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-xl font-bold text-foreground">iOS Early Access</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        Join our TestFlight program to get the latest iOS version directly from Apple.
                                    </p>
                                </div>
                                <a
                                    href="https://testflight.apple.com/join/2YqE1UzR"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center gap-2 w-full bg-blue-500 hover:bg-blue-600 text-white font-bold text-lg px-6 py-4 rounded-xl shadow-lg shadow-blue-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    <Download className="h-5 w-5" />
                                    Download via TestFlight
                                </a>
                                <p className="text-xs text-muted-foreground/70">
                                    Requires the free Apple TestFlight app.
                                </p>
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="flex items-center justify-center gap-4 max-w-md mx-auto opacity-50">
                            <div className="h-px bg-border flex-1"></div>
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">or</span>
                            <div className="h-px bg-border flex-1"></div>
                        </div>

                        {/* Android APK Section */}
                        {release ? (
                            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 max-w-md mx-auto shadow-xl backdrop-blur-sm space-y-6">
                                <div className="flex justify-center">
                                    <div className="h-16 w-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                                        <Smartphone className="h-8 w-8 text-emerald-500" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-xl font-bold text-foreground">Android Direct APK</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        Download and install the raw APK file directly to your Android device.
                                    </p>
                                </div>
                                
                                <div className="space-y-4">
                                    <a
                                        href={release.file_url}
                                        download
                                        className="inline-flex items-center justify-center gap-2 w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-lg px-6 py-4 rounded-xl shadow-lg shadow-emerald-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                    >
                                        <Download className="h-5 w-5" />
                                        Download APK
                                    </a>
                                    
                                    <div className="flex flex-wrap flex-col items-center justify-center gap-2 text-sm text-emerald-500/80 font-medium">
                                        <span>Version {release.version_name}</span>
                                        <span className="text-xs text-muted-foreground">{formatBytes(release.file_size_bytes)}</span>
                                    </div>

                                    {/* Installation Guide internal to card */}
                                    <div className="mt-6 pt-6 border-t border-white/5 text-left space-y-3">
                                        <div className="flex items-center gap-2 text-sm font-bold text-foreground mx-auto justify-center">
                                            <Shield className="h-4 w-4 text-emerald-500" />
                                            Install Guide
                                        </div>
                                        <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside max-w-[280px] mx-auto">
                                            <li>Download the <strong>.apk</strong> file</li>
                                            <li>Open it and enable &quot;Install from unknown sources&quot; if asked</li>
                                            <li>Follow prompts to install</li>
                                        </ol>
                                    </div>
                                    
                                    {/* Release Notes */}
                                    {release.release_notes && (
                                        <div className="mt-4 pt-4 border-t border-white/5 text-left">
                                            <p className="text-xs font-bold text-foreground mb-1 text-center">What&apos;s New:</p>
                                            <p className="text-xs text-muted-foreground whitespace-pre-line text-center max-w-[280px] mx-auto">
                                                {release.release_notes}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-muted/30 border border-border/50 rounded-xl p-8 max-w-md mx-auto">
                                <Smartphone className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                                <p className="font-medium text-foreground">Android Coming Soon</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    The direct APK is being prepared. Check back soon!
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
