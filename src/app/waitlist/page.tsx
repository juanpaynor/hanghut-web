import { Metadata } from 'next';
import Link from 'next/link';
import { WaitlistForm } from '@/components/waitlist/waitlist-form';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Join the Waitlist | HangHut',
    description: 'Find your crowd. Join the HangHut waitlist to discover shared experiences and build your intentional community.',
};

export default function WaitlistPage() {
    return (
        <div className="min-h-screen w-full flex flex-col lg:flex-row bg-background overflow-hidden relative">

            {/* Top Navigation Overlay */}
            <div className="absolute top-0 left-0 w-full p-6 md:p-8 z-50 flex justify-between items-center pointer-events-none">
                <Link href="/" className="pointer-events-auto">
                    <div className="bg-primary px-4 py-2 rounded-xl border-b-4 border-r-4 border-primary-foreground transform -rotate-3 hover:rotate-0 transition-transform shadow-lg group">
                        <span className="font-headline font-black text-white text-xl tracking-wider group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all">
                            HANGHUT
                        </span>
                    </div>
                </Link>
                <Link
                    href="/"
                    className="pointer-events-auto flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors bg-background/50 backdrop-blur-md px-4 py-2 rounded-full border border-border/50"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Main
                </Link>
            </div>

            {/* Left Side: Interactive Form Area */}
            <div className="flex-1 flex flex-col justify-center px-6 pt-32 pb-24 lg:px-16 xl:px-24 z-10 bg-background/80 backdrop-blur-sm lg:max-w-[55%]">
                <div className="w-full max-w-lg mx-auto lg:mx-0">
                    {/* Animated Typography */}
                    <div className="space-y-6 mb-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
                        <div className="inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-bold text-primary tracking-wide uppercase shadow-sm border border-primary/20">
                            Early Access Waitlist
                        </div>
                        <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold font-headline tracking-tighter text-foreground leading-[1.1]">
                            Find your <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-500 mr-2">
                                crowd.
                            </span>
                        </h1>
                        <p className="text-xl md:text-2xl text-muted-foreground font-light leading-relaxed max-w-md">
                            Discover curated tables, shared experiences, and build your intentional community.
                        </p>
                    </div>

                    {/* The Interactive Form Component */}
                    <div className="animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300 fill-mode-both">
                        <WaitlistForm />
                    </div>
                </div>
            </div>

            {/* Right Side: Visual WOW Factor */}
            <div className="w-full lg:w-[45%] lg:relative absolute inset-0 -z-10 lg:z-0 overflow-hidden bg-zinc-950">
                {/* Dynamic CSS Gradient Mesh */}
                <div className="absolute inset-0 opacity-40 lg:opacity-100 mix-blend-screen lg:mix-blend-normal">
                    <div className="absolute top-[10%] left-[20%] w-[60vmin] h-[60vmin] bg-primary/60 rounded-full blur-[100px] animate-[pulse_8s_ease-in-out_infinite]" />
                    <div className="absolute top-[40%] right-[10%] w-[50vmin] h-[50vmin] bg-indigo-500/50 rounded-full blur-[90px] animate-[pulse_10s_ease-in-out_infinite_1s]" />
                    <div className="absolute bottom-[10%] left-[30%] w-[70vmin] h-[70vmin] bg-orange-500/40 rounded-full blur-[120px] animate-[pulse_12s_ease-in-out_infinite_2s]" />
                </div>

                {/* Floating Glass Cards (Desktop Only) */}
                <div className="hidden lg:flex absolute inset-0 items-center justify-center perspective-[1000px]">
                    <div className="relative w-full max-w-lg aspect-square animate-[spin_60s_linear_infinite]">

                        {/* Decorative floating element 1 */}
                        <div className="absolute top-1/4 left-0 w-64 p-6 rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl transform -translate-x-1/2 -rotate-12 animate-[bounce_8s_ease-in-out_infinite]">
                            <div className="h-4 w-1/3 bg-white/30 rounded-full mb-3" />
                            <div className="h-3 w-3/4 bg-white/20 rounded-full mb-2" />
                            <div className="h-3 w-1/2 bg-white/20 rounded-full" />
                            <div className="mt-4 flex gap-2">
                                <div className="h-8 w-8 rounded-full bg-primary/50" />
                                <div className="h-8 w-8 rounded-full bg-orange-400/50 -ml-4 border border-white/20" />
                                <div className="h-8 w-8 rounded-full bg-indigo-400/50 -ml-4 border border-white/20 shadow-sm" />
                            </div>
                        </div>

                        {/* Decorative floating element 2 */}
                        <div className="absolute bottom-1/4 right-0 w-56 p-5 rounded-box bg-background/20 backdrop-blur-md border border-white/10 shadow-[0_0_50px_rgba(255,255,255,0.05)] transform translate-x-1/2 rotate-6 animate-[bounce_10s_ease-in-out_infinite_1s]">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-orange-400" />
                                <div>
                                    <div className="h-3 w-16 bg-white/40 rounded-full mb-2" />
                                    <div className="h-2 w-24 bg-white/20 rounded-full" />
                                </div>
                            </div>
                            <div className="h-10 w-full bg-white/10 rounded-xl" />
                        </div>
                    </div>
                </div>

                {/* Subtle Overlay Pattern */}
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
            </div>

        </div>
    );
}
