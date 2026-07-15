'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SubscribersTable } from '@/components/organizer/marketing/subscribers-table'
import { CampaignComposer } from '@/components/organizer/marketing/campaign-composer'
import { CampaignHistory } from '@/components/organizer/marketing/campaign-history'
import { AutomationsManager } from '@/components/organizer/marketing/automations-manager'
import { Users, Sparkles, Zap, History } from 'lucide-react'

const TABS = [
    { value: 'subscribers', label: 'Subscribers', icon: Users },
    { value: 'campaigns', label: 'Create Campaign', icon: Sparkles },
    { value: 'automations', label: 'Automations', icon: Zap },
    { value: 'history', label: 'Sent History', icon: History },
]

export default function MarketingPage() {
    return (
        <div className="flex-1 p-6 sm:p-8 pt-6">
            {/* Hero header */}
            <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 p-6 sm:p-8 text-white shadow-lg">
                <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                <div className="relative">
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
                        <Sparkles className="h-3.5 w-3.5" /> Marketing
                    </div>
                    <h2 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight">Reach your audience</h2>
                    <p className="mt-1 max-w-xl text-sm text-white/80">
                        Design beautiful campaigns, target the right customers, and automate the follow-ups — all in one place.
                    </p>
                </div>
            </div>

            <Tabs defaultValue="subscribers" className="mt-6 space-y-6">
                <TabsList className="h-auto flex-wrap gap-1 rounded-xl bg-muted/60 p-1">
                    {TABS.map(({ value, label, icon: Icon }) => (
                        <TabsTrigger
                            key={value}
                            value={value}
                            className="gap-1.5 rounded-lg px-3 py-1.5 text-sm data-[state=active]:shadow-sm"
                        >
                            <Icon className="h-4 w-4" />
                            {label}
                        </TabsTrigger>
                    ))}
                </TabsList>
                <TabsContent value="subscribers" className="space-y-4">
                    <SubscribersTable />
                </TabsContent>
                <TabsContent value="campaigns" className="space-y-4">
                    <CampaignComposer />
                </TabsContent>
                <TabsContent value="automations" className="space-y-4">
                    <AutomationsManager />
                </TabsContent>
                <TabsContent value="history" className="space-y-4">
                    <CampaignHistory />
                </TabsContent>
            </Tabs>
        </div>
    )
}
