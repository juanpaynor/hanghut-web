import { getAuthUser, getPartnerId } from '@/lib/auth/cached'
import { redirect } from 'next/navigation'
import { CustomerBehaviour } from '@/components/organizer/customer-behaviour'

export const dynamic = 'force-dynamic'

export default async function CustomersPage() {
    const { user } = await getAuthUser()
    if (!user) redirect('/organizer/login')

    const partnerId = await getPartnerId(user.id)
    if (!partnerId) redirect('/organizer')

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-3xl font-bold">Customers</h1>
                <p className="text-muted-foreground">Understand how your audience behaves across your events.</p>
            </div>
            <CustomerBehaviour partnerId={partnerId} />
        </div>
    )
}
