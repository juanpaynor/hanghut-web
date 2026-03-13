import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { WaitlistForm } from '@/components/waitlist/waitlist-form';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Join the Waitlist | HangHut',
    description: 'Find your crowd. Join the HangHut waitlist to discover shared experiences and build your intentional community.',
};

export default function WaitlistPage() {
    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-white overflow-hidden relative">

            {/* Animated Gradient Blobs */}
            {/* Animated Gradient Blobs — all inline styles for reliability */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }} aria-hidden="true">
                {/* Top-left - indigo */}
                <div style={{
                    position: 'absolute', top: '-120px', left: '-100px',
                    width: '500px', height: '500px', borderRadius: '50%',
                    background: '#a5b4fc', opacity: 0.5,
                    filter: 'blur(80px)',
                    animation: 'blob-float 12s ease-in-out infinite',
                }} />
                {/* Top-right - peach */}
                <div style={{
                    position: 'absolute', top: '-80px', right: '-100px',
                    width: '450px', height: '450px', borderRadius: '50%',
                    background: '#fdba74', opacity: 0.4,
                    filter: 'blur(80px)',
                    animation: 'blob-float-reverse 14s ease-in-out infinite',
                }} />
                {/* Bottom-left - orange */}
                <div style={{
                    position: 'absolute', bottom: '-100px', left: '-80px',
                    width: '420px', height: '420px', borderRadius: '50%',
                    background: '#fb923c', opacity: 0.35,
                    filter: 'blur(80px)',
                    animation: 'blob-float-slow 16s ease-in-out infinite',
                }} />
                {/* Bottom-right - violet */}
                <div style={{
                    position: 'absolute', bottom: '-140px', right: '-100px',
                    width: '500px', height: '500px', borderRadius: '50%',
                    background: '#c4b5fd', opacity: 0.45,
                    filter: 'blur(80px)',
                    animation: 'blob-float 18s ease-in-out infinite 2s',
                }} />
                {/* Center-left - blue accent */}
                <div style={{
                    position: 'absolute', top: '50%', left: '-60px',
                    width: '300px', height: '300px', borderRadius: '50%',
                    background: '#93c5fd', opacity: 0.3,
                    filter: 'blur(80px)',
                    animation: 'blob-float-reverse 20s ease-in-out infinite 1s',
                }} />
            </div>

            {/* Top Navigation */}
            <div className="absolute top-0 left-0 w-full p-5 md:p-8 z-50 flex justify-between items-center">
                <Link href="/" className="flex items-center space-x-3 group">
                    <div className="relative h-10 w-10 transition-transform group-hover:scale-105">
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
                    className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors bg-white/60 backdrop-blur-md px-4 py-2 rounded-full border border-slate-200/60 shadow-sm"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                </Link>
            </div>

            {/* Centered Card */}
            <div className="relative z-10 w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-700">
                <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_8px_60px_-12px_rgba(0,0,0,0.08)] border border-slate-200/50 p-8 md:p-10">

                    {/* Logo */}
                    <div className="flex justify-center mb-6">
                        <div className="relative h-14 w-14">
                            <Image
                                src="/logo_transparent.png"
                                alt="HangHut"
                                fill
                                className="object-contain"
                            />
                        </div>
                    </div>

                    {/* Badge */}
                    <div className="flex justify-center mb-5">
                        <span className="inline-block rounded-full bg-indigo-50 px-4 py-1.5 text-xs font-bold text-indigo-600 tracking-wide uppercase border border-indigo-100">
                            Early Access
                        </span>
                    </div>

                    {/* Heading */}
                    <div className="text-center mb-6">
                        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
                            Find your{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-orange-400">
                                crowd.
                            </span>
                        </h1>
                        <p className="mt-3 text-sm md:text-base text-slate-500 leading-relaxed">
                            Find an activity. Share a moment. Leave with a good story — and people you didn&apos;t know you needed.
                        </p>
                    </div>

                    {/* Form */}
                    <WaitlistForm />

                    {/* Footer note */}
                    <p className="text-center text-xs text-slate-400 mt-5">
                        No spam. We&apos;ll only email you when we launch.
                    </p>
                </div>
            </div>

        </div>
    );
}
