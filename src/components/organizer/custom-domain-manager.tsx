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
    // null = not checked yet this session; false = ownership may be verified
    // but the hostname still doesn't point at us.
    const [dnsReady, setDnsReady] = useState<boolean | null>(currentVerified ? true : null)
    const [copied, setCopied] = useState<string | null>(null)

    // An apex (mimicmanila.com) can't carry a CNAME, so it gets an A record at
    // "@" instead. Everything deeper is a subdomain and CNAMEs its first label.
    const labels = activeDomain?.split('.') ?? []
    const isApex = labels.length <= 2
    const zone = isApex ? activeDomain ?? '' : labels.slice(1).join('.')
    const trafficRecord = isApex
        ? { type: 'A', name: '@', value: '76.76.21.21' }
        : { type: 'CNAME', name: labels[0] ?? '', value: 'cname.hanghut.com' }
    const live = verified && dnsReady !== false

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
        setDnsReady(null)
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
        setDnsReady(result.dnsReady ?? null)
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
        setDnsReady(null)
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
                            {live ? (
                                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                            ) : (
                                <XCircle className="h-5 w-5 text-amber-500 shrink-0" />
                            )}
                            <div>
                                <p className="font-medium text-sm">{activeDomain}</p>
                                <p className="text-xs text-muted-foreground">
                                    {live
                                        ? 'Domain verified & live'
                                        : verified
                                            ? 'Ownership verified — waiting for DNS to point here'
                                            : 'Pending DNS verification'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {live && (
                                <a
                                    href={`https://${activeDomain}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    <ExternalLink className="h-4 w-4" />
                                </a>
                            )}
                            <Badge variant={live ? 'default' : 'secondary'} className={cn(live && 'bg-green-500/15 text-green-700 border-green-500/30')}>
                                {live ? 'Active' : verified ? 'DNS pending' : 'Unverified'}
                            </Badge>
                        </div>
                    </div>

                    {/* DNS instructions (shown until the domain is actually serving).
                        Two different records do two different jobs: the CNAME/A
                        sends traffic here, and the TXT (only when Vercel asks for
                        it) proves the organizer owns the zone. The old panel showed
                        ONE of them — whichever Vercel returned — so a domain could
                        "verify" via TXT and still dead-end with no CNAME. */}
                    {!live && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-4">
                            <div className="flex items-center gap-2 text-amber-700">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                <p className="text-sm font-semibold">
                                    {verification ? 'Action required: add these DNS records' : 'Action required: add a DNS record'}
                                </p>
                            </div>

                            <ol className="text-sm text-amber-900 space-y-1 list-decimal list-inside">
                                <li>Log in to your domain registrar (GoDaddy, Cloudflare, Namecheap, etc.)</li>
                                <li>Go to the <strong>DNS settings</strong> for <strong>{zone}</strong></li>
                                <li>Add {verification ? 'both records' : 'the record'} below, then click <strong>Check Status</strong></li>
                            </ol>

                            {/* DNS record table */}
                            <div className="rounded-md border bg-white overflow-hidden text-sm">
                                <div className="grid grid-cols-[80px_1fr_1fr] bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    <span>Type</span>
                                    <span>Name</span>
                                    <span>Value</span>
                                </div>
                                <DnsRow
                                    type={trafficRecord.type}
                                    name={trafficRecord.name}
                                    value={trafficRecord.value}
                                    note="Sends visitors to HangHut"
                                    done={dnsReady === true}
                                    copied={copied}
                                    onCopy={copy}
                                />
                                {verification && (
                                    <DnsRow
                                        type={verification.type}
                                        name={verification.domain}
                                        value={verification.value}
                                        note="Proves you own the domain"
                                        done={verified}
                                        copied={copied}
                                        onCopy={copy}
                                    />
                                )}
                            </div>

                            {verification && (
                                <p className="text-xs text-amber-900/80">
                                    Vercel is asking for the TXT record because <strong>{activeDomain}</strong> was already pointed at another
                                    site. Some registrars want the TXT name entered as just <code className="font-mono">_vercel</code>.
                                </p>
                            )}

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

function DnsRow({
    type, name, value, note, done, copied, onCopy,
}: {
    type: string
    name: string
    value: string
    note: string
    done: boolean
    copied: string | null
    onCopy: (text: string, key: string) => void
}) {
    const nameKey = `${type}-name`
    const valueKey = `${type}-value`
    return (
        <div className={cn(
            'grid grid-cols-[80px_1fr_1fr] px-3 py-3 font-mono text-xs items-center gap-2 border-t first:border-t-0',
            done && 'bg-green-500/5',
        )}>
            <div className="flex items-center gap-1.5">
                {done && <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />}
                <span className="font-semibold">{type}</span>
            </div>
            <div className="min-w-0">
                <div className="flex items-center gap-1 min-w-0">
                    <span className="truncate">{name}</span>
                    <button onClick={() => onCopy(name, nameKey)} className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Copy name">
                        <Copy className="h-3 w-3" />
                    </button>
                    {copied === nameKey && <span className="text-green-600 text-[10px]">Copied!</span>}
                </div>
                <p className="mt-0.5 font-sans text-[11px] text-muted-foreground">{note}</p>
            </div>
            <div className="flex items-center gap-1 min-w-0">
                <span className="truncate">{value}</span>
                <button onClick={() => onCopy(value, valueKey)} className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Copy value">
                    <Copy className="h-3 w-3" />
                </button>
                {copied === valueKey && <span className="text-green-600 text-[10px]">Copied!</span>}
            </div>
        </div>
    )
}
