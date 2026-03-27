import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PartnerSettingsForm } from '@/components/organizer/partner-settings-form'
import AccountSettingsForm from '@/components/organizer/account-settings-form'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Settings, User, ShieldAlert } from 'lucide-react'
import { getAuthUser, getPartner, getUserRole } from '@/lib/auth/cached'
import { Card } from '@/components/ui/card'

export default async function SettingsPage() {
    // Cached — layout already resolved auth
    const { user } = await getAuthUser()
    if (!user) {
        redirect('/organizer/login')
    }

    const partner = await getPartner(user.id)
    if (!partner) {
        redirect('/organizer/register')
    }

    const userRole = await getUserRole(user.id)
    const isOwner = userRole?.role === 'owner'

    // Only owner can see/edit org-level settings — fetch full partner data
    let fullPartner = null
    if (isOwner) {
        const supabase = await createClient()
        const { data } = await supabase
            .from('partners')
            .select('*')
            .eq('id', partner.id)
            .single()
        fullPartner = data
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-6">Settings</h1>

            {isOwner ? (
                <Tabs defaultValue="general" className="w-full">
                    <TabsList className="mb-6 grid w-full grid-cols-2">
                        <TabsTrigger value="general" className="flex items-center gap-2">
                            <Settings className="h-4 w-4" />
                            General
                        </TabsTrigger>
                        <TabsTrigger value="account" className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            Account
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="general">
                        {fullPartner && <PartnerSettingsForm initialData={fullPartner} />}
                    </TabsContent>

                    <TabsContent value="account">
                        <AccountSettingsForm />
                    </TabsContent>
                </Tabs>
            ) : (
                /* Team members only see their own account settings */
                <div className="space-y-6">
                    <Card className="p-4 border-amber-500/30 bg-amber-500/5">
                        <div className="flex items-center gap-3 text-amber-600">
                            <ShieldAlert className="h-5 w-5 shrink-0" />
                            <p className="text-sm">Organization settings are only available to the account owner. You can manage your personal account below.</p>
                        </div>
                    </Card>
                    <AccountSettingsForm />
                </div>
            )}
        </div>
    )
}
