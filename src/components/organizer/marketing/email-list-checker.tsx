'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader2, ShieldCheck, AlertTriangle, XCircle, Copy, Check } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { checkEmailList, type EmailCheckSummary } from '@/lib/marketing/email-check-actions'
import { cn } from '@/lib/utils'

/**
 * Paste a list, find out what's wrong with it before you send.
 *
 * Shows the four things that actually cost an organizer a campaign: addresses
 * that cannot receive mail, addresses that look mistyped, duplicates, and people
 * already unsubscribed. Every count is clickable — a number with no way to see
 * what it refers to is just an accusation.
 */

type Lens = 'invalid' | 'typos' | 'clean' | null

/** Split on anything a spreadsheet, a CRM export or a person might use. */
function splitAddresses(raw: string): string[] {
    return raw.split(/[\s,;\n\r\t]+/).map(s => s.trim()).filter(Boolean)
}

export function EmailListChecker() {
    const { toast } = useToast()
    const [raw, setRaw] = useState('')
    const [checking, setChecking] = useState(false)
    const [result, setResult] = useState<EmailCheckSummary | null>(null)
    const [lens, setLens] = useState<Lens>(null)
    const [copied, setCopied] = useState(false)

    const count = splitAddresses(raw).length

    const run = async () => {
        setChecking(true)
        setLens(null)
        const res = await checkEmailList(splitAddresses(raw))
        setChecking(false)
        if (res.error) {
            toast({ title: 'Could not check that list', description: res.error, variant: 'destructive' })
            return
        }
        setResult(res.data!)
        // Open on the most actionable problem, rather than making them hunt.
        setLens(res.data!.typos > 0 ? 'typos' : res.data!.invalid > 0 ? 'invalid' : 'clean')
    }

    const applyCorrections = () => {
        if (!result) return
        const map = new Map(result.corrections.map(c => [c.from.toLowerCase(), c.to]))
        const fixed = splitAddresses(raw).map(a => map.get(a.trim().toLowerCase()) ?? a)
        setRaw(fixed.join('\n'))
        setResult(null)
        setLens(null)
        toast({
            title: `Applied ${result.corrections.length} correction${result.corrections.length === 1 ? '' : 's'}`,
            description: 'Check again to confirm the list is clean.',
        })
    }

    const copyClean = async () => {
        if (!result) return
        try {
            await navigator.clipboard.writeText(result.cleanList.join('\n'))
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast({ title: 'Could not copy', description: 'Select the list and copy manually.', variant: 'destructive' })
        }
    }

    const shown = result
        ? lens === 'invalid' ? result.rows.filter(r => !r.ok)
        : lens === 'typos' ? result.rows.filter(r => r.ok && r.suggestion)
        : lens === 'clean' ? result.rows.filter(r => r.ok && !r.suggestion)
        : []
        : []

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Check a list
                </CardTitle>
                <CardDescription>
                    Paste addresses to find dead ones, typos and duplicates before you send.
                    Bounces hurt delivery for every email you send afterwards, including ticket confirmations.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Textarea
                    value={raw}
                    onChange={e => { setRaw(e.target.value); setResult(null); setLens(null) }}
                    rows={6}
                    placeholder={"juan@gmail.com\nmaria@yahoo.com\n…one per line, or paste a column from a spreadsheet"}
                    className="font-mono text-xs"
                />

                <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={run} disabled={checking || count === 0}>
                        {checking
                            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking…</>
                            : `Check ${count > 0 ? count.toLocaleString() : ''} address${count === 1 ? '' : 'es'}`}
                    </Button>
                    {result && result.corrections.length > 0 && (
                        <Button variant="outline" onClick={applyCorrections}>
                            Fix {result.corrections.length} typo{result.corrections.length === 1 ? '' : 's'}
                        </Button>
                    )}
                    {result && result.clean > 0 && (
                        <Button variant="ghost" onClick={copyClean}>
                            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                            Copy {result.clean.toLocaleString()} clean
                        </Button>
                    )}
                </div>

                {result && (
                    <>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                            <Tile label="Ready to send" value={result.clean} tone="good"
                                  active={lens === 'clean'} onClick={() => setLens('clean')} />
                            <Tile label="Likely typos" value={result.typos} tone="warn"
                                  active={lens === 'typos'} onClick={() => setLens('typos')} />
                            <Tile label="Can't receive" value={result.invalid} tone="bad"
                                  active={lens === 'invalid'} onClick={() => setLens('invalid')} />
                            <Tile label="Duplicates" value={result.duplicates} tone="muted" />
                            <Tile label="Unsubscribed" value={result.suppressed} tone="muted" />
                        </div>

                        {shown.length > 0 && (
                            <div className="max-h-72 overflow-auto rounded-md border">
                                <table className="w-full text-xs">
                                    <tbody>
                                        {shown.slice(0, 500).map((r, i) => (
                                            <tr key={`${r.input}-${i}`} className="border-b last:border-0">
                                                <td className="px-3 py-1.5 font-mono">{r.normalized || r.input}</td>
                                                <td className="px-3 py-1.5 text-right text-muted-foreground">
                                                    {r.error
                                                        ? r.error
                                                        : r.suggestion
                                                            ? <>did you mean <span className="font-medium text-foreground">{r.suggestion}</span></>
                                                            : 'ok'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {shown.length > 500 && (
                                    <p className="px-3 py-2 text-xs text-muted-foreground">
                                        Showing the first 500 of {shown.length.toLocaleString()}.
                                    </p>
                                )}
                            </div>
                        )}

                        {result.typos === 0 && result.invalid === 0 && (
                            <p className="text-xs text-muted-foreground">
                                Nothing wrong with this list. Duplicates and unsubscribes are removed automatically when you send.
                            </p>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    )
}

function Tile({ label, value, tone, active, onClick }: {
    label: string
    value: number
    tone: 'good' | 'warn' | 'bad' | 'muted'
    active?: boolean
    onClick?: () => void
}) {
    const Icon = tone === 'good' ? ShieldCheck : tone === 'warn' ? AlertTriangle : tone === 'bad' ? XCircle : null
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!onClick || value === 0}
            className={cn(
                'rounded-lg border px-3 py-2 text-left transition-colors',
                active && 'ring-2 ring-primary/40',
                onClick && value > 0 ? 'hover:bg-muted' : 'cursor-default',
                tone === 'warn' && value > 0 && 'border-amber-500/40 bg-amber-500/5',
                tone === 'bad' && value > 0 && 'border-destructive/40 bg-destructive/5',
            )}
        >
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {Icon && <Icon className="h-3 w-3" />}{label}
            </span>
            <span className="mt-0.5 block text-lg font-semibold tabular-nums">{value.toLocaleString()}</span>
        </button>
    )
}
