import { Smartphone } from 'lucide-react'
import { StoreButtons } from '@/components/landing/store-buttons'

interface Props {
    title?: string
    description?: string
}

export function AppDownloadPrompt({
    title = 'Continue on the HangHut app',
    description = 'Registration for this event is handled through the HangHut app. Download it free to register and manage your bookings.',
}: Props) {
    return (
        <div className="rounded-2xl border border-border bg-muted/30 p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Smartphone className="h-7 w-7 text-primary" />
            </div>
            <div className="space-y-1.5">
                <p className="font-semibold text-base">{title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                    {description}
                </p>
            </div>
            <StoreButtons variant="dark" className="justify-center" />
        </div>
    )
}
