'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { Loader2, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';

export function WaitlistForm() {
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [phoneType, setPhoneType] = useState<'android' | 'iphone' | null>(null);
    const supabase = createClient();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setStatus('loading');
        setErrorMessage('');

        const formData = new FormData(e.currentTarget);
        const fullName = formData.get("name") as string;
        const email = formData.get("email") as string;

        const { error } = await supabase
            .from('waitlist')
            .insert({ full_name: fullName, email, source: 'waitlist_page', phone_type: phoneType });

        if (!error) {
            setStatus('success');
        } else {
            setStatus('error');
            setErrorMessage(error.code === '23505' ? "You're already on the waitlist! 🚀" : "Something went wrong. Please try again.");
        }
    };

    return (
        <div className="w-full relative">
            <AnimatePresence mode="wait">
                {status !== 'success' ? (
                    <motion.div
                        key="form"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20, scale: 0.95 }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        className="space-y-8"
                    >
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Floating Label Input: Name */}
                            <div className="relative group">
                                <input
                                    type="text"
                                    id="name"
                                    name="name"
                                    required
                                    className="peer w-full h-14 bg-background border-2 border-muted hover:border-primary/50 focus:border-primary rounded-2xl px-4 pt-4 pb-1 text-base outline-none transition-all"
                                    placeholder=" "
                                />
                                <label
                                    htmlFor="name"
                                    className="absolute left-4 top-1 text-xs font-bold text-muted-foreground uppercase tracking-wider transition-all peer-placeholder-shown:text-base peer-placeholder-shown:top-4 peer-placeholder-shown:font-normal peer-focus:top-1 peer-focus:text-xs peer-focus:font-bold peer-focus:text-primary pointer-events-none"
                                >
                                    Full Name
                                </label>
                            </div>

                            {/* Floating Label Input: Email */}
                            <div className="relative group">
                                <input
                                    type="email"
                                    id="email"
                                    name="email"
                                    required
                                    className="peer w-full h-14 bg-background border-2 border-muted hover:border-primary/50 focus:border-primary rounded-2xl px-4 pt-4 pb-1 text-base outline-none transition-all"
                                    placeholder=" "
                                />
                                <label
                                    htmlFor="email"
                                    className="absolute left-4 top-1 text-xs font-bold text-muted-foreground uppercase tracking-wider transition-all peer-placeholder-shown:text-base peer-placeholder-shown:top-4 peer-placeholder-shown:font-normal peer-focus:top-1 peer-focus:text-xs peer-focus:font-bold peer-focus:text-primary pointer-events-none"
                                >
                                    Email Address
                                </label>
                            </div>

                            {/* Phone Type Selector */}
                            <div className="space-y-2">
                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider pl-1">
                                    What phone do you use?
                                </p>
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setPhoneType('android')}
                                        className={`flex-1 h-12 rounded-2xl border-2 font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                                            phoneType === 'android'
                                                ? 'border-primary bg-primary/10 text-primary'
                                                : 'border-muted text-muted-foreground hover:border-primary/50'
                                        }`}
                                    >
                                        Android
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPhoneType('iphone')}
                                        className={`flex-1 h-12 rounded-2xl border-2 font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                                            phoneType === 'iphone'
                                                ? 'border-primary bg-primary/10 text-primary'
                                                : 'border-muted text-muted-foreground hover:border-primary/50'
                                        }`}
                                    >
                                        iPhone
                                    </button>
                                </div>
                            </div>

                            {status === 'error' && (
                                <motion.p
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="text-destructive text-sm font-medium pl-2"
                                >
                                    {errorMessage}
                                </motion.p>
                            )}

                            <button
                                type="submit"
                                disabled={status === 'loading'}
                                className="w-full h-14 bg-primary text-primary-foreground rounded-full font-bold text-lg flex items-center justify-center gap-2 group hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-[0.98] disabled:opacity-80 disabled:pointer-events-none overflow-hidden relative"
                            >
                                <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                                {status === 'loading' ? (
                                    <>
                                        <Loader2 className="h-6 w-6 animate-spin" />
                                        <span>Saving Your Spot...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Join the Waitlist</span>
                                        <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                                    </>
                                )}
                            </button>
                        </form>

                    </motion.div>
                ) : (
                    <motion.div
                        key="success"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center justify-center text-center space-y-6 py-8"
                    >
                        <motion.div
                            initial={{ scale: 0, rotate: -45 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: "spring", delay: 0.1, bounce: 0.5, duration: 0.8 }}
                            className="h-24 w-24 bg-primary/10 rounded-full flex items-center justify-center mb-4"
                        >
                            <CheckCircle2 className="h-12 w-12 text-primary drop-shadow-[0_0_15px_rgba(var(--primary),0.5)]" />
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                        >
                            <h3 className="text-3xl font-headline font-extrabold text-foreground tracking-tight mb-2">
                                You&apos;re On The List!
                            </h3>
                            <p className="text-lg text-muted-foreground max-w-[280px] mx-auto leading-relaxed">
                                Keep an eye on your inbox. We&apos;ll notify you the moment we launch so you can start finding your crowd.
                            </p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
