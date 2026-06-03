'use client'

import { useState, useTransition } from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Crown } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { updateMembershipTabVisibility } from '@/lib/organizer/settings-actions'

interface Props {
    initialValue: boolean
}

export function MembershipTabToggle({ initialValue }: Props) {
    const { toast } = useToast()
    const [enabled, setEnabled] = useState(initialValue)
    const [isPending, startTransition] = useTransition()

    const handleChange = (checked: boolean) => {
        setEnabled(checked)
        startTransition(async () => {
            const result = await updateMembershipTabVisibility(checked)
            if (result.error) {
                setEnabled(!checked) // revert
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            } else {
                toast({ title: checked ? 'Members tab enabled' : 'Members tab hidden' })
            }
        })
    }

    return (
        <div className="flex items-center justify-between">
            <div className="space-y-0.5">
                <Label className="text-base flex items-center gap-2">
                    <Crown className="h-4 w-4 text-primary" />
                    Show Members Tab
                </Label>
                <p className="text-sm text-muted-foreground">
                    Add a Members tab to your storefront linking to your membership page.
                    Only visible when you have active subscription tiers.
                </p>
            </div>
            <Switch
                checked={enabled}
                onCheckedChange={handleChange}
                disabled={isPending}
            />
        </div>
    )
}
