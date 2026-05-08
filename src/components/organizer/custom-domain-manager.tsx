'use client'

import { useState } from 'react'
import { Globe, CheckCircle2, XCircle, RefreshCw, Copy, Trash2, ExternalLink, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { registerCustomDomain, checkCustomDomainStatus, removeCustomDomain } from '@/lib/organizer/custom-domain-actions'
import { cn } from '@/lib/utils'

interface Props {
    currentDomain: string | null
    currentVerified: boolean
}

export function CustomDomainManager({ currentDomain, currentVerified }: Props) {
    const [domain, setDomain] = useState('')
    const [saving, setSaving] = useState(false)
    const [checking, setChecking] = useState(false)
    const [removing, setRemoving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [activeDomain, setActiveDomain] = useState<string | null>(currentDomain)
    const [verified, setVerified] = useState(currentVerified)
    const [verification, setVerification] = useState<{
        type: string
        domain: string
        value: string
    } | null>(null)
    const [copied, setCopied] = useState<string | null>(null)

    const handleAdd = async () => {
        if (!domain.trim()) return
        setSaving(true)
        setError(null)
        const result = await registerCustomDomain(domain.trim().toLowerCase())
        setSaving(false)
        if ('error' in result && result.error) {
            setError(result.error)
            return
        }
        setActiveDomain(result.domain!)
        setVerified(false)
        setVerification(result.verification ?? null)
        setDomain('')
    }

    const handleCheck = async () => {
        setChecking(true)
        setError(null)
        const result = await checkCustomDomainStatus()
        setChecking(false)
        if ('error' in result && result.error) {
            setError(result.error)
            return
        }
        setVerified(result.verified!)
        if (result.verification?.length) {
            const v = result.verification[0]
            setVerification({ type: v.type, domain: v.domain, value: v.value })
        } else if (result.verified) {
            setVerification(null)
        }
    }

    const handleRemove = async () => {
        if (!confirm(`Remove ${activeDomain}? Your storefront will revert to your hanghut.com subdomain.`)) return
        setRemoving(true)
        const result = await removeCustomDomain()
        setRemoving(false)
        if ('error' in result && result.error) {
            setError(result.error)
            return
        }
        setActiveDomain(null)
        setVerified(false)
        setVerification(null)
    }

    const copy = (text: string, key: string) => {
        navigator.clipboard.writeText(text)
        setCopied(key)
        setTimeout(() => setCopied(null), 2000)
    }

    return (
        <div className="space-y-4">
            {!activeDomain ? (
                /* ── Add domain ── */
                <div className="space-y-3">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                className="pl-9"
                                placeholder="tickets.yourdomain.com"
                                value={domain}
                                onChange={e => setDomain(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                            />
                        </div>
                        <Button onClick={handleAdd} disabled={saving || !domain.trim()}>
                            {saving ? 'Adding…' : 'Add Domain'}
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Use any domain or subdomain you own. You'll add a DNS record after saving.
                    </p>
                </div>
            ) : (
                /* ── Active domain ── */
                <div className="space-y-4">
                    {/* Status row */}
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-3">
                            {verified ? (
                                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                            ) : (
                                <XCircle className="h-5 w-5 text-amber-500 shrink-0" />
                            )}
                            <div>
                                <p className="font-medium text-sm">{activeDomain}</p>
                                <p className="text-xs text-muted-foreground">
                                    {verified ? 'Domain verified & live' : 'Pending DNS verification'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {verified && (
                                <a
                                    href={`https://${activeDomain}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    <ExternalLink className="h-4 w-4" />
                                </a>
                            )}
                            <Badge variant={verified ? 'default' : 'secondary'} className={cn(verified && 'bg-green-500/15 text-green-700 border-green-500/30')}>
                                {verified ? 'Active' : 'Unverified'}
                            </Badge>
                        </div>
                    </div>

                    {/* DNS instructions (shown until verified) */}
                    {!verified && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-4">
                            <div className="flex items-center gap-2 text-amber-700">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                <p className="text-sm font-semibold">Action required: add a DNS record</p>
                            </div>

                            <ol className="text-sm text-amber-900 space-y-1 list-decimal list-inside">
                                <li>Log in to your domain registrar (GoDaddy, Cloudflare, Namecheap, etc.)</li>
                                <li>Go to the <strong>DNS settings</strong> for <strong>{activeDomain?.split('.').slice(1).join('.')}</strong></li>
                                <li>Add the record below, then click <strong>Check Status</strong></li>
                            </ol>

                            {/* DNS record table */}
                            <div className="rounded-md border bg-white overflow-hidden text-sm">
                                <div className="grid grid-cols-[80px_1fr_1fr] bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    <span>Type</span>
                                    <span>Name</span>
                                    <span>Value</span>
                                </div>
                                {verification ? (
                                    <div className="grid grid-cols-[80px_1fr_1fr] px-3 py-3 font-mono text-xs items-center gap-2">
                                        <span className="font-semibold">{verification.type}</span>
                                        <div className="flex items-center gap-1 min-w-0">
                                            <span className="truncate">{verification.domain}</span>
                                            <button onClick={() => copy(verification.domain, 'name')} className="text-muted-foreground hover:text-foreground shrink-0">
                                                <Copy className="h-3 w-3" />
                                            </button>
                                            {copied === 'name' && <span className="text-green-600 text-[10px]">Copied!</span>}
                                        </div>
                                        <div className="flex items-center gap-1 min-w-0">
                                            <span className="truncate">{verification.value}</span>
                                            <button onClick={() => copy(verification.value, 'value')} className="text-muted-foreground hover:text-foreground shrink-0">
                                                <Copy className="h-3 w-3" />
                                            </button>
                                            {copied === 'value' && <span className="text-green-600 text-[10px]">Copied!</span>}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-[80px_1fr_1fr] px-3 py-3 font-mono text-xs items-center gap-2">
                                        <span className="font-semibold">CNAME</span>
                                        <div className="flex items-center gap-1 min-w-0">
                                            <span className="truncate">{activeDomain?.split('.')[0]}</span>
                                            <button onClick={() => copy(activeDomain!.split('.')[0], 'name')} className="text-muted-foreground hover:text-foreground shrink-0">
                                                <Copy className="h-3 w-3" />
                                            </button>
                                            {copied === 'name' && <span className="text-green-600 text-[10px]">Copied!</span>}
                                        </div>
                                        <div className="flex items-center gap-1 min-w-0">
                                            <span className="truncate">cname.vercel-dns.com</span>
                                            <button onClick={() => copy('cname.vercel-dns.com', 'value')} className="text-muted-foreground hover:text-foreground shrink-0">
                                                <Copy className="h-3 w-3" />
                                            </button>
                                            {copied === 'value' && <span className="text-green-600 text-[10px]">Copied!</span>}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <p className="text-xs text-amber-700/80">
                                ⏱ DNS changes usually propagate within minutes, but can take up to 48 hours.
                            </p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                        {!verified && (
                            <Button variant="outline" size="sm" onClick={handleCheck} disabled={checking}>
                                <RefreshCw className={cn('h-4 w-4 mr-2', checking && 'animate-spin')} />
                                {checking ? 'Checking…' : 'Check Status'}
                            </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={handleRemove} disabled={removing} className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" />
                            {removing ? 'Removing…' : 'Remove Domain'}
                        </Button>
                    </div>
                </div>
            )}

            {error && (
                <p className="text-sm text-red-500 flex items-center gap-1.5">
                    <XCircle className="h-4 w-4 shrink-0" />
                    {error}
                </p>
            )}
        </div>
    )
}
