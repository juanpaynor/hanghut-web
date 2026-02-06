'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SubscribersTable } from '@/components/organizer/marketing/subscribers-table'
import { CampaignComposer } from '@/components/organizer/marketing/campaign-composer'

export default function MarketingPage() {
    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Email Marketing</h2>
            </div>
            <Tabs defaultValue="subscribers" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="subscribers">Subscribers</TabsTrigger>
                    <TabsTrigger value="campaigns">Create Campaign</TabsTrigger>
                </TabsList>
                <TabsContent value="subscribers" className="space-y-4">
                    <SubscribersTable />
                </TabsContent>
                <TabsContent value="campaigns" className="space-y-4">
                    <CampaignComposer />
                </TabsContent>
            </Tabs>
        </div>
    )
}
