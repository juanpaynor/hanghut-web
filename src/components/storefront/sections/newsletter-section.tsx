'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2, CheckCircle2 } from 'lucide-react'

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
            // Same RLS problem as the Follow dialog in profile-actions.tsx — a
            // direct insert here was denied for every visitor. Both now share the
            // subscribe_to_partner RPC; only `source` differs.
            const supabase = createClient()
            const { data, error } = await supabase.rpc('subscribe_to_partner', {
                p_partner_id: partnerId,
                p_email: email.trim(),
                p_source: 'newsletter',
            })

            const result = data as { success: boolean; reason?: string; already_subscribed?: boolean } | null

            if (error || !result?.success) {
                setStatus('error')
                setMessage(
                    result?.reason === 'invalid_email'
                        ? "That email doesn't look right. Mind checking it?"
                        : 'Something went wrong. Please try again.'
                )
            } else {
                setStatus('success')
                setMessage(
                    result.already_subscribed
                        ? "You're already subscribed!"
                        : "You're subscribed! We'll keep you posted."
                )
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
                            <h3 className="font-semibold text-[1.0625rem] tracking-[-0.01em]">{heading}</h3>
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
    // The directional primary/5-to-transparent wash is gone. It lit one edge of
    // the band and faded out under the form, which read as a rendering artefact
    // rather than a design; a single hairline-bounded panel states the same
    // "this is a different kind of block" without the smear.
    return (
        <section id="newsletter" className="py-16 md:py-24">
            <div className="container mx-auto px-4 sm:px-6 max-w-3xl">
                <div className="rounded-3xl border border-border/60 bg-muted/30 px-6 py-12 text-center md:px-12 md:py-16">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2.5">
                    Newsletter
                </p>
                <h2 data-hh-section-title className="text-[1.75rem] md:text-[2.125rem] font-semibold leading-[1.15] tracking-[-0.02em] text-balance">{heading}</h2>
                <p className="mx-auto mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground mb-8">{subheading}</p>

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
            </div>
        </section>
    )
}
