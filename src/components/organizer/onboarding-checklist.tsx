import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Circle, Clock, ShieldCheck, CalendarPlus, Banknote, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type Step = {
    title: string
    description: string
    icon: any
    done: boolean
    pending?: boolean          // in-progress, no action available (e.g. KYC in review)
    cta?: { label: string; href: string }
}

/**
 * Guided onboarding shown on the dashboard home for partners who haven't finished
 * setting up. Renders nothing once verification, a first event, and payouts are
 * all done — so established partners never see it.
 */
export async function OnboardingChecklist({ partnerId, kycStatus }: { partnerId: string; kycStatus: string | null }) {
    const supabase = await createClient()

    const [{ count: eventCount }, { count: bankAccountCount }] = await Promise.all([
        supabase.from('events').select('id', { count: 'exact', head: true }).eq('organizer_id', partnerId),
        // Payout destinations live in bank_accounts — partners.bank_account_number is a
        // legacy column the organizer payout flow never writes.
        supabase.from('bank_accounts').select('id', { count: 'exact', head: true }).eq('partner_id', partnerId),
    ])

    const verified = kycStatus === 'verified'
    const inReview = kycStatus === 'pending_review' || kycStatus === 'submitted'
    const hasEvent = (eventCount ?? 0) > 0
    const hasPayout = (bankAccountCount ?? 0) > 0

    const steps: Step[] = [
        {
            title: 'Get verified',
            description: verified
                ? 'Your business is verified — GCash & card payments are unlocked.'
                : inReview
                    ? 'Your verification is being reviewed. We’ll email you when it’s done.'
                    : 'Verify your business to accept GCash & card payments.',
            icon: ShieldCheck,
            done: verified,
            pending: inReview,
            cta: verified || inReview ? undefined : { label: 'Start verification', href: '/organizer/verification' },
        },
        {
            title: 'Create your first event',
            description: hasEvent ? 'Your first event is live.' : 'Set up an event and start selling tickets.',
            icon: CalendarPlus,
            done: hasEvent,
            cta: hasEvent ? undefined : { label: 'Create event', href: '/organizer/events/create' },
        },
        {
            title: 'Set up payouts',
            description: hasPayout ? 'Your payout account is set.' : 'Add your bank details so you can get paid.',
            icon: Banknote,
            done: hasPayout,
            cta: hasPayout ? undefined : { label: 'Set up payouts', href: '/organizer/payouts' },
        },
    ]

    const allDone = steps.every(s => s.done)
    if (allDone) return null

    const completed = steps.filter(s => s.done).length

    return (
        <Card className="p-6 border-primary/20 bg-primary/[0.03]">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-lg font-bold">Finish setting up</h2>
                    <p className="text-sm text-muted-foreground">A few steps to start selling and getting paid.</p>
                </div>
                <span className="text-sm font-medium text-muted-foreground shrink-0">{completed}/{steps.length} done</span>
            </div>
            <div className="space-y-2.5">
                {steps.map((step) => {
                    const Icon = step.icon
                    return (
                        <div key={step.title} className={cn(
                            'flex items-center gap-3 rounded-xl border p-3',
                            step.done ? 'bg-green-50/50 border-green-200' : 'bg-background',
                        )}>
                            <div className="shrink-0">
                                {step.done
                                    ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                                    : step.pending
                                        ? <Clock className="h-5 w-5 text-blue-500" />
                                        : <Circle className="h-5 w-5 text-muted-foreground/40" />}
                            </div>
                            <Icon className={cn('h-4 w-4 shrink-0', step.done ? 'text-green-600' : 'text-muted-foreground')} />
                            <div className="min-w-0 flex-1">
                                <p className={cn('text-sm font-medium', step.done && 'text-green-900')}>{step.title}</p>
                                <p className="text-xs text-muted-foreground truncate">{step.description}</p>
                            </div>
                            {step.cta && (
                                <Button asChild size="sm" variant={step.done ? 'ghost' : 'default'} className="shrink-0">
                                    <Link href={step.cta.href}>{step.cta.label}<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link>
                                </Button>
                            )}
                            {step.pending && <span className="text-xs text-blue-600 font-medium shrink-0">In review</span>}
                        </div>
                    )
                })}
            </div>
        </Card>
    )
}
