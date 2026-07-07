'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { Loader2, FileText, CheckCircle2, ExternalLink } from 'lucide-react'
import {
    getServiceAgreementStatus,
    getServiceAgreementViewUrl,
    signServiceAgreement,
    type AgreementStatus,
} from '@/lib/organizer/service-agreement-actions'

export function ServiceAgreementSign({ onSigned }: { onSigned?: () => void }) {
    const { toast } = useToast()
    const [status, setStatus] = useState<AgreementStatus | null>(null)
    const [viewUrl, setViewUrl] = useState<string | null>(null)
    const [name, setName] = useState('')
    const [agreed, setAgreed] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        getServiceAgreementStatus().then(setStatus).catch(() => setStatus(null))
        getServiceAgreementViewUrl().then(r => setViewUrl(r.url ?? null)).catch(() => {})
    }, [])

    async function handleSign() {
        if (!name.trim()) { toast({ title: 'Name required', description: 'Type your full legal name to sign.', variant: 'destructive' }); return }
        if (!agreed) { toast({ title: 'Please confirm', description: 'Tick the box to confirm you have read and agree.', variant: 'destructive' }); return }
        setSubmitting(true)
        const r = await signServiceAgreement(name.trim())
        setSubmitting(false)
        if (r.success) {
            toast({ title: 'Agreement signed', description: 'Your Service Agreement has been recorded.' })
            setStatus(await getServiceAgreementStatus())
            onSigned?.()
        } else {
            toast({ title: 'Could not sign', description: r.error, variant: 'destructive' })
        }
    }

    if (status?.signed && status.current) {
        return (
            <Card className="border-emerald-500/30 bg-emerald-500/5">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        <CardTitle className="text-emerald-700 text-base">Service Agreement signed</CardTitle>
                    </div>
                    <CardDescription className="text-emerald-700/80">
                        Signed by {status.signer_name}{status.signed_at ? ` on ${new Date(status.signed_at).toLocaleDateString()}` : ''}.
                    </CardDescription>
                </CardHeader>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-5 w-5 text-primary" />
                    Xendit Services Agreement
                </CardTitle>
                <CardDescription>
                    Review and electronically sign the Services Agreement (with HangHut as your platform). This is required to activate payments.
                    {status?.signed && !status.current && ' The agreement was updated — please re-sign the latest version.'}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {viewUrl ? (
                    <a href={viewUrl} target="_blank" rel="noopener noreferrer"
                       className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                        <ExternalLink className="h-4 w-4" /> Read the full agreement (incl. Data Privacy Consent)
                    </a>
                ) : (
                    <p className="text-sm text-muted-foreground">Loading the agreement…</p>
                )}

                <div className="space-y-2">
                    <Label htmlFor="sa-name">Full legal name (your electronic signature)</Label>
                    <Input id="sa-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Juan D. Cruz" />
                </div>

                <label className="flex items-start gap-3 cursor-pointer text-sm">
                    <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
                           className="mt-1 h-4 w-4 rounded border-primary text-primary focus:ring-primary" />
                    <span>
                        I have read and agree to the <span className="font-medium">Xendit Services Agreement</span> and its
                        <span className="font-medium"> Schedule 1 (Data Privacy Consent)</span>, and I am authorized to sign on behalf of this business.
                    </span>
                </label>

                <Button className="w-full" onClick={handleSign} disabled={submitting || !name.trim() || !agreed}>
                    {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Signing…</> : 'Sign electronically'}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                    Signing records your name, email, IP address and timestamp as your Audit Trail.
                </p>
            </CardContent>
        </Card>
    )
}
