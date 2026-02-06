"use client";

import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';

const SocialVortex = dynamic(() => import('./social-vortex'), {
    ssr: false,
    loading: () => <div className="w-full h-full bg-white/50 backdrop-blur-sm" />
});

export default function SocialCircleSection() {
    return (
        <section className="relative w-full min-h-[90vh] flex flex-col items-center pt-24 pb-12 bg-background overflow-hidden">

            {/* Content Header */}
            <div className="relative z-10 text-center px-4 max-w-4xl mx-auto space-y-6 mb-12">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                    className="relative z-10"
                >
                    <h2 className="text-5xl md:text-8xl font-headline font-bold tracking-tighter text-indigo-950 mb-6">
                        Instant <span className="text-primary">Social Circle</span>
                    </h2>
                    <p className="text-2xl md:text-3xl text-indigo-900/80 font-light leading-relaxed max-w-2xl mx-auto">
                        Match with fellow Hanghut users in the same city, on the same dates.
                        You are instantly dropped into a destination group chat.
                    </p>
                </motion.div>
            </div>

            {/* Immersive Background Animation - Below Text */}
            <div className="relative w-full flex-1 min-h-[500px] md:min-h-[600px]">
                <div className="absolute inset-x-0 inset-y-0 scale-90 md:scale-100 origin-top">
                    <SocialVortex isFullScreen={true} />
                </div>
            </div>
        </section>
    );
}
