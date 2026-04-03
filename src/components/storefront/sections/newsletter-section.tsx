'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Mail, Loader2, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NewsletterSectionProps {
    config: {
        variant?: 'inline' | 'banner'
        heading?: string
        subheading?: string
    }
    partnerId: string
    partnerName: string
}

export function NewsletterSection({ config, partnerId, partnerName }: NewsletterSectionProps) {
    const variant = config.variant || 'banner'
    const heading = config.heading || 'Stay in the loop'
    const subheading = config.subheading || `Get notified about upcoming events from ${partnerName}`

    const [email, setEmail] = useState('')
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
    const [message, setMessage] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email.trim()) return

        setStatus('loading')
        try {
            const supabase = createClient()
            const { error } = await supabase.from('partner_subscribers').insert({
                partner_id: partnerId,
                email: email.trim().toLowerCase(),
            })

            if (error) {
                if (error.code === '23505') {
                    setStatus('success')
                    setMessage("You're already subscribed!")
                } else {
                    setStatus('error')
                    setMessage('Something went wrong. Please try again.')
                }
            } else {
                setStatus('success')
                setMessage("You're subscribed! We'll keep you posted.")
                setEmail('')
            }
        } catch {
            setStatus('error')
            setMessage('Something went wrong. Please try again.')
        }
    }

    // ─── Inline variant: simple row ───
    if (variant === 'inline') {
        return (
            <section className="py-12">
                <div className="container mx-auto px-4 max-w-2xl">
                    <div className="flex flex-col sm:flex-row items-center gap-4 p-6 rounded-2xl border bg-card/50">
                        <div className="flex-1 text-center sm:text-left">
                            <h3 className="font-semibold text-lg flex items-center gap-2 justify-center sm:justify-start">
                                <Mail className="h-5 w-5 text-primary" />
                                {heading}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">{subheading}</p>
                        </div>
                        {status === 'success' ? (
                            <div className="flex items-center gap-2 text-green-600 font-medium">
                                <CheckCircle2 className="h-5 w-5" />
                                {message}
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="flex gap-2 w-full sm:w-auto">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Enter your email"
                                    required
                                    className="flex-1 sm:w-56 px-4 py-2.5 rounded-full border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                                <button
                                    type="submit"
                                    disabled={status === 'loading'}
                                    className="px-6 py-2.5 bg-primary text-primary-foreground rounded-full font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                                >
                                    {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Subscribe'}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </section>
        )
    }

    // ─── Banner variant: full-width ───
    return (
        <section id="newsletter" className="py-20 md:py-24 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent" />
            <div className="container mx-auto px-4 relative z-10 text-center max-w-2xl">
                <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Mail className="h-7 w-7 text-primary" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold mb-3">{heading}</h2>
                <p className="text-muted-foreground mb-8 text-lg">{subheading}</p>

                {status === 'success' ? (
                    <div className="flex items-center justify-center gap-2 text-green-600 font-semibold text-lg animate-in fade-in zoom-in duration-300">
                        <CheckCircle2 className="h-6 w-6" />
                        {message}
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Enter your email"
                            required
                            className="flex-1 px-5 py-3 rounded-full border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                        <button
                            type="submit"
                            disabled={status === 'loading'}
                            className="px-8 py-3 bg-primary text-primary-foreground rounded-full font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                            {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Subscribe'}
                        </button>
                    </form>
                )}

                {status === 'error' && (
                    <p className="text-red-500 text-sm mt-3">{message}</p>
                )}
            </div>
        </section>
    )
}
