import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, CheckCircle, Clock, ShieldCheck, FileText, Upload } from 'lucide-react'
import { KYCVerificationForm } from './kyc-form'

export default async function VerificationPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/organizer/login')
    }

    const { data: partner } = await supabase
        .from('partners')
        .select('kyc_status, kyc_rejection_reason, business_name')
        .eq('user_id', user.id)
        .single()

    if (!partner) {
        // Edge case: User logged in but no partner profile?
        return <div>Error: Partner profile not found.</div>
    }

    const status = partner.kyc_status || 'not_started'

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Verification</h1>
                    <p className="text-muted-foreground">
                        Verify your identity to unlock payouts and public features.
                    </p>
                </div>
            </div>

            {/* Status Cards */}
            {status === 'verified' && (
                <Card className="bg-green-50 border-green-200">
                    <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                        <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                            <ShieldCheck className="h-6 w-6 text-green-600" />
                        </div>
                        <div>
                            <CardTitle className="text-green-800">Account Verified</CardTitle>
                            <CardDescription className="text-green-700">
                                You have full access to all HangHut organizer features.
                            </CardDescription>
                        </div>
                    </CardHeader>
                </Card>
            )}

            {status === 'pending_review' && (
                <Card className="bg-blue-50 border-blue-200">
                    <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                        <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                            <Clock className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                            <CardTitle className="text-blue-800">Verification In Progress</CardTitle>
                            <CardDescription className="text-blue-700">
                                Our team is reviewing your documents. This usually takes 24-48 hours.
                            </CardDescription>
                        </div>
                    </CardHeader>
                </Card>
            )}

            {status === 'rejected' && (
                <Card className="bg-red-50 border-red-200 mb-6">
                    <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                        <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                            <AlertCircle className="h-6 w-6 text-red-600" />
                        </div>
                        <div>
                            <CardTitle className="text-red-800">Verification Rejected</CardTitle>
                            <CardDescription className="text-red-700">
                                Please update your submission. Reason: {partner.kyc_rejection_reason || 'Document mismatch'}
                            </CardDescription>
                        </div>
                    </CardHeader>
                </Card>
            )}

            {/* Submission Form */}
            {(status === 'not_started' || status === 'rejected') && (
                <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Identity & Business Types</CardTitle>
                                <CardDescription>
                                    We need to know who you are representing.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex gap-4 items-start">
                                    <div className="h-8 w-8 rounded bg-secondary flex items-center justify-center mt-1">
                                        <span className="font-bold text-sm">1</span>
                                    </div>
                                    <div>
                                        <h4 className="font-medium">Representative Info</h4>
                                        <p className="text-sm text-muted-foreground">
                                            The actual human responsible for this account.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-4 items-start">
                                    <div className="h-8 w-8 rounded bg-secondary flex items-center justify-center mt-1">
                                        <span className="font-bold text-sm">2</span>
                                    </div>
                                    <div>
                                        <h4 className="font-medium">Valid ID</h4>
                                        <p className="text-sm text-muted-foreground">
                                            Passport, Driver's License, or National ID.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-4 items-start">
                                    <div className="h-8 w-8 rounded bg-secondary flex items-center justify-center mt-1">
                                        <span className="font-bold text-sm">3</span>
                                    </div>
                                    <div>
                                        <h4 className="font-medium">Digital Signature</h4>
                                        <p className="text-sm text-muted-foreground">
                                            Agree to our Partner Terms of Service.
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Submit Verification</CardTitle>
                            <CardDescription>
                                Upload your documents securely.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <KYCVerificationForm userEmail={user.email} />
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    )
}
