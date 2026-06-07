'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogIn } from 'lucide-react'

interface Props {
    label?: string
    className?: string
}

export function LoginNudge({ label = 'Sign in for faster checkout', className }: Props) {
    const pathname = usePathname()
    return (
        <p className={`text-center text-sm text-muted-foreground ${className ?? ''}`}>
            <Link
                href={`/account/login?next=${encodeURIComponent(pathname)}`}
                className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium"
            >
                <LogIn className="h-3.5 w-3.5" />
                {label}
            </Link>
        </p>
    )
}
