'use client'

/**
 * Delete or cancel an experience.
 *
 * These are not two ways of doing the same thing, and the UI should not let
 * them look like it. tables.id cascades into purchase intents, transactions,
 * reviews, schedules, messages and promo codes — so once an experience has
 * taken money, deleting it would erase the bookings and their payment records
 * along with the listing. That is why only ONE of the two is ever offered.
 *
 * The server re-checks; this only decides what to show.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2, Ban, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
    AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
    deleteExperience, cancelExperience, reopenExperience,
} from '@/lib/organizer/experience-actions'

export function ExperienceDangerZone({
    experienceId,
    title,
    status,
    canDelete,
    bookings,
}: {
    experienceId: string
    title: string
    status: string
    canDelete: boolean
    bookings: number
}) {
    const router = useRouter()
    const { toast } = useToast()
    const [busy, setBusy] = useState(false)
    const isCancelled = status === 'cancelled'

    const run = async (
        fn: () => Promise<{ success?: true; error?: string }>,
        okTitle: string,
        okDescription: string,
        goToList: boolean,
    ) => {
        setBusy(true)
        const res = await fn()
        setBusy(false)

        if (res.error) {
            toast({ title: 'Could not complete that', description: res.error, variant: 'destructive' })
            return
        }
        toast({ title: okTitle, description: okDescription })
        if (goToList) router.push('/organizer/experiences')
        else router.refresh()
    }

    return (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
            <h3 className="font-semibold text-foreground">
                {isCancelled ? 'This experience is cancelled' : 'Danger zone'}
            </h3>

            <p className="mt-1 text-sm text-muted-foreground">
                {isCancelled
                    ? "It's hidden from search and its page, and no one can book it. Existing bookings and records are untouched."
                    : canDelete
                      ? 'This experience has never been booked, so it can still be deleted permanently.'
                      : `${bookings} booking${bookings === 1 ? '' : 's'} have been paid for. Deleting would erase them and their payment records, so this can only be cancelled.`}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
                {isCancelled ? (
                    <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                            run(() => reopenExperience(experienceId), 'Experience reopened',
                                'It’s listed again. Your dates stay cancelled — reopen the ones you want.', false)
                        }
                    >
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                        Reopen experience
                    </Button>
                ) : (
                    <ConfirmButton
                        busy={busy}
                        icon={<Ban className="mr-2 h-4 w-4" />}
                        label="Cancel experience"
                        variant="outline"
                        title={`Cancel “${title}”?`}
                        description="It will be removed from search and its page, and future dates will be cancelled so nobody can book. Bookings, reviews and payment records are kept, and you can reopen it later."
                        confirmLabel="Cancel experience"
                        onConfirm={() =>
                            run(() => cancelExperience(experienceId), 'Experience cancelled',
                                'It’s no longer bookable. You can reopen it any time.', false)
                        }
                    />
                )}

                {canDelete && !isCancelled && (
                    <ConfirmButton
                        busy={busy}
                        icon={<Trash2 className="mr-2 h-4 w-4" />}
                        label="Delete permanently"
                        variant="destructive"
                        title={`Delete “${title}”?`}
                        description="This cannot be undone. The experience, its dates, promo codes and photos are removed for good. It has never been booked, so no one loses a reservation."
                        confirmLabel="Delete permanently"
                        onConfirm={() =>
                            run(() => deleteExperience(experienceId), 'Experience deleted',
                                `“${title}” has been removed.`, true)
                        }
                    />
                )}
            </div>
        </div>
    )
}

function ConfirmButton({
    busy, icon, label, variant, title, description, confirmLabel, onConfirm,
}: {
    busy: boolean
    icon: React.ReactNode
    label: string
    variant: 'outline' | 'destructive'
    title: string
    description: string
    confirmLabel: string
    onConfirm: () => void
}) {
    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant={variant} disabled={busy}>
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : icon}
                    {label}
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    {/* "Keep it" rather than "Cancel": the destructive action here is
                        itself called Cancel, and two buttons both saying cancel is how
                        someone withdraws a live experience by accident. */}
                    <AlertDialogCancel>Keep it</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onConfirm}
                        className={variant === 'destructive'
                            ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                            : undefined}
                    >
                        {confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
