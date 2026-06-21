import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import LoginClient from './login-client'

export default async function LoginPage() {
    const headersList = await headers()
    const host = (headersList.get('host') || '').split(':')[0]
    const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'hanghut.com'

    // Only accessible via the admin subdomain (admin.hanghut.com).
    // Block on the main domain and any other host.
    const isAdminDomain =
        host === `admin.${ROOT_DOMAIN}` ||
        host === `admin.localhost`

    if (!isAdminDomain) notFound()

    return <LoginClient />
}
