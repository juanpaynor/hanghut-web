import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/account/login?next=/account')

    return <>{children}</>
}
