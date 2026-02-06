import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PartnerSettingsForm } from '@/components/organizer/partner-settings-form'
import { BrandingForm } from '@/components/organizer/branding-form'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Settings, Palette } from 'lucide-react'

export default async function SettingsPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        redirect('/organizer/login')
    }

    const { data: partner } = await supabase
        .from('partners')
        .select('*')
        .eq('user_id', user.id)
        .single()

    if (!partner) {
        redirect('/organizer/register')
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-6">Settings</h1>

            <Tabs defaultValue="general" className="w-full">
                <TabsList className="mb-6">
                    <TabsTrigger value="general" className="flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        General
                    </TabsTrigger>
                    <TabsTrigger value="branding" className="flex items-center gap-2">
                        <Palette className="h-4 w-4" />
                        Branding
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="general">
                    <PartnerSettingsForm initialData={partner} />
                </TabsContent>

                <TabsContent value="branding">
                    <BrandingForm partner={partner} />
                </TabsContent>
            </Tabs>
        </div>
    )
}
