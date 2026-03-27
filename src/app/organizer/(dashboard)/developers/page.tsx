import { getAuthUser, getPartnerId, getUserRole } from '@/lib/auth/cached'
import { redirect } from 'next/navigation'
import { getApiKeys } from '@/lib/organizer/api-key-actions'
import { ApiKeysClient } from '@/components/organizer/api-keys-client'

export const dynamic = 'force-dynamic'

export default async function DevelopersPage() {
    const { user } = await getAuthUser()
    if (!user) redirect('/organizer/login')

    // Only owners can manage API keys
    const userRole = await getUserRole(user.id)
    if (!userRole || userRole.role !== 'owner') redirect('/organizer')

    const partnerId = await getPartnerId(user.id)
    if (!partnerId) redirect('/organizer')

    const { keys } = await getApiKeys(partnerId)

    return <ApiKeysClient partnerId={partnerId} initialKeys={keys} />
}
