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
                            Discover curated gatherings, shared experiences, and build your community.
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
                {/* Background Video */}
                <div className="absolute inset-0">
                    <video
                        src="https://api.hanghut.com/storage/v1/object/public/video-waitlist/8261840-uhd_4096_2160_25fps.mp4"
                        autoPlay
                        muted
                        loop
                        playsInline
                        className="w-full h-full object-cover"
                    />
                </div>

                {/* Subtle Overlay Pattern */}
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay text-white" />
            </div>

        </div>
    );
}
