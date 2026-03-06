import { getWaitlistEntries } from '@/lib/waitlist-actions'
import { WaitlistClient } from './waitlist-client'
import { AdminEmailComposer } from './admin-email-composer'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const dynamic = 'force-dynamic'

export default async function WaitlistPage() {
    const { entries, total } = await getWaitlistEntries(1, 50)

    return (
        <div className="p-6 md:p-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Waitlist</h1>
                <p className="text-slate-500 mt-1">
                    {total} {total === 1 ? 'person' : 'people'} signed up from the landing page.
                </p>
            </div>
            <Tabs defaultValue="list" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="list">Subscriber List</TabsTrigger>
                    <TabsTrigger value="email">Send Email</TabsTrigger>
                </TabsList>
                <TabsContent value="list">
                    <WaitlistClient initialEntries={entries} initialTotal={total} />
                </TabsContent>
                <TabsContent value="email">
                    <AdminEmailComposer waitlistCount={total} />
                </TabsContent>
            </Tabs>
        </div>
    )
}
