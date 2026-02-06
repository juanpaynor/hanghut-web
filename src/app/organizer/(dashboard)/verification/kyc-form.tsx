'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { submitKYCVerification } from '@/lib/organizer/verification-actions'
import { Upload, PenTool } from 'lucide-react'

// Submit Button with loading state
function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <Button disabled={pending} type="submit" className="w-full">
            {pending ? 'Submitting Verification...' : 'Submit Documents & Sign'}
        </Button>
    )
}

export function KYCVerificationForm({ userEmail }: { userEmail?: string }) {
    const [state, action] = useActionState(submitKYCVerification, undefined)

    return (
        <form action={action} className="space-y-6 animate-in fade-in slide-in-from-bottom-4">

            {/* Contact Details */}
            <div className="space-y-4">
                <h3 className="font-semibold text-lg border-b pb-2">Contact Details</h3>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="representative_name">Representative Name</Label>
                        <Input
                            id="representative_name"
                            name="representative_name"
                            placeholder="e.g. John Doe"
                            required
                        />
                        {state?.errors?.representative_name && (
                            <p className="text-sm text-red-500">{state.errors.representative_name}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="contact_number">Mobile Number</Label>
                        <Input
                            id="contact_number"
                            name="contact_number"
                            placeholder="+63 900 000 0000"
                            required
                        />
                        {state?.errors?.contact_number && (
                            <p className="text-sm text-red-500">{state.errors.contact_number}</p>
                        )}
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="work_email">Work Email (Optional)</Label>
                    <Input
                        id="work_email"
                        name="work_email"
                        defaultValue={userEmail}
                        placeholder="events@company.com"
                    />
                </div>
            </div>

            {/* Document Uploads */}
            <div className="space-y-4">
                <h3 className="font-semibold text-lg border-b pb-2">Documents</h3>

                <div className="space-y-2">
                    <Label htmlFor="id_document">Government ID (Passport / Driver's License)</Label>
                    <div className="border-2 border-dashed rounded-lg p-6 hover:bg-muted/50 transition-colors text-center cursor-pointer">
                        <Input
                            id="id_document"
                            name="id_document"
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            required
                            onChange={(e) => {
                                // Optional: simple preview logic or filename display could depend on state
                                const fileName = e.target.files?.[0]?.name;
                                const display = document.getElementById('id-file-name');
                                if (display && fileName) display.innerText = fileName;
                            }}
                        />
                        <Label htmlFor="id_document" className="cursor-pointer block w-full h-full">
                            <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                            <p className="text-sm font-medium">Click to upload ID Document</p>
                            <p className="text-xs text-muted-foreground mt-1" id="id-file-name">Supports JPG, PNG, PDF (Max 5MB)</p>
                        </Label>
                    </div>
                    {state?.errors?.id_document && (
                        <p className="text-sm text-red-500">{state.errors.id_document}</p>
                    )}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="business_document">Business Registration (Optional for Individuals)</Label>
                    <div className="border-2 border-dashed rounded-lg p-6 hover:bg-muted/50 transition-colors text-center">
                        <Input
                            id="business_document"
                            name="business_document"
                            type="file"
                            accept="image/*,application/pdf"
                            className="cursor-pointer"
                        />
                        <p className="text-xs text-muted-foreground mt-1">DTI, SEC, or BIR Certificate</p>
                    </div>
                    {state?.errors?.business_document && (
                        <p className="text-sm text-red-500">{state.errors.business_document}</p>
                    )}
                </div>
            </div>

            {/* Terms & Signature */}
            <div className="space-y-4">
                <h3 className="font-semibold text-lg border-b pb-2">Terms & Agreement</h3>

                <div className="h-32 overflow-y-auto bg-muted p-4 rounded text-sm text-muted-foreground border">
                    <p className="font-bold mb-2">HangHut Partner Agreement (v1.0)</p>
                    <p>By signing below, you allow HangHut to process your data for verification purposes...</p>
                    <p className="mt-2">[Terms of Service Placeholder Text...]</p>
                    <p className="mt-2">1. You agree to provide accurate information.</p>
                    <p>2. You are authorized to represent this business.</p>
                    <p>3. You agree to our anti-fraud and payout policies.</p>
                </div>

                <div className="flex items-start space-x-2 pt-2">
                    <Checkbox id="terms_accepted" name="terms_accepted" required />
                    <Label htmlFor="terms_accepted" className="text-sm leading-none pt-1">
                        I have read and agree to the Partner Terms of Service.
                    </Label>
                </div>
                {state?.errors?.terms_accepted && (
                    <p className="text-sm text-red-500">{state.errors.terms_accepted}</p>
                )}

                <div className="space-y-2 pt-2">
                    <Label htmlFor="digital_signature_text" className="flex items-center gap-2">
                        <PenTool className="h-4 w-4" />
                        Digital Signature
                    </Label>
                    <Input
                        id="digital_signature_text"
                        name="digital_signature_text"
                        placeholder="Type your full name to sign"
                        required
                        className="font-serif italic text-lg bg-yellow-50/50"
                    />
                    {state?.errors?.digital_signature_text && (
                        <p className="text-sm text-red-500">{state.errors.digital_signature_text}</p>
                    )}
                </div>
            </div>

            {state?.message && (
                <div className={`p-4 rounded-md ${state.errors ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
                    {state.message}
                </div>
            )}

            <SubmitButton />
        </form>
    )
}
