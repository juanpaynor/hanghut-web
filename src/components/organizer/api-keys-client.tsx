'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Key, Plus, Copy, Check, Trash2, Eye, EyeOff, AlertTriangle, ExternalLink } from 'lucide-react'
import { createApiKey, revokeApiKey, deleteApiKey } from '@/lib/organizer/api-key-actions'
import { useToast } from '@/hooks/use-toast'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'

interface ApiKey {
    id: string
    key_prefix: string
    name: string
    is_active: boolean
    created_at: string
    last_used_at: string | null
}

interface ApiKeysClientProps {
    partnerId: string
    initialKeys: ApiKey[]
}

export function ApiKeysClient({ partnerId, initialKeys }: ApiKeysClientProps) {
    const [keys, setKeys] = useState<ApiKey[]>(initialKeys)
    const [newKeyName, setNewKeyName] = useState('')
    const [isCreating, setIsCreating] = useState(false)
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [newRawKey, setNewRawKey] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [revokingId, setRevokingId] = useState<string | null>(null)
    const { toast } = useToast()

    const activeKeys = keys.filter(k => k.is_active)

    const handleCreate = async () => {
        setIsCreating(true)
        try {
            const result = await createApiKey(partnerId, newKeyName)
            if (result.error) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
                return
            }
            setNewRawKey(result.rawKey)
            setKeys(prev => [{ ...result.key!, is_active: true, last_used_at: null } as ApiKey, ...prev])
            setNewKeyName('')
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' })
        } finally {
            setIsCreating(false)
        }
    }

    const handleCopy = async (text: string) => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        toast({ title: 'Copied!', description: 'API key copied to clipboard' })
        setTimeout(() => setCopied(false), 2000)
    }

    const handleRevoke = async (keyId: string) => {
        setRevokingId(keyId)
        try {
            const result = await revokeApiKey(partnerId, keyId)
            if (result.error) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
                return
            }
            setKeys(prev => prev.map(k => k.id === keyId ? { ...k, is_active: false } : k))
            toast({ title: 'Key Revoked', description: 'The API key has been deactivated.' })
        } finally {
            setRevokingId(null)
        }
    }

    const handleDelete = async (keyId: string) => {
        try {
            const result = await deleteApiKey(partnerId, keyId)
            if (result.error) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
                return
            }
            setKeys(prev => prev.filter(k => k.id !== keyId))
            toast({ title: 'Key Deleted' })
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' })
        }
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">API Keys</h1>
                    <p className="text-muted-foreground mt-1">
                        Integrate HangHut ticketing into your own website or app.
                    </p>
                </div>
                {!showCreateForm && !newRawKey && (
                    <Button onClick={() => setShowCreateForm(true)} disabled={activeKeys.length >= 5}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create API Key
                    </Button>
                )}
            </div>

            {/* Newly created key — show once */}
            {newRawKey && (
                <Card className="border-primary bg-primary/5">
                    <CardHeader>
                        <CardTitle className="text-primary flex items-center gap-2">
                            <Key className="h-5 w-5" />
                            Your New API Key
                        </CardTitle>
                        <CardDescription className="text-primary/70">
                            Copy this key now — it will not be shown again!
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex gap-2">
                            <code className="flex-1 bg-background rounded-lg px-4 py-3 font-mono text-sm border border-border break-all">
                                {newRawKey}
                            </code>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleCopy(newRawKey)}
                                className="shrink-0"
                            >
                                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                            </Button>
                        </div>
                        <div className="flex items-start gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>Store this key securely. It cannot be retrieved after you leave this page.</span>
                        </div>
                        <Button variant="outline" onClick={() => { setNewRawKey(null); setShowCreateForm(false) }}>
                            I've saved the key
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Create form */}
            {showCreateForm && !newRawKey && (
                <Card>
                    <CardHeader>
                        <CardTitle>Create New API Key</CardTitle>
                        <CardDescription>Give it a name to help you remember what it's for.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex gap-3">
                            <Input
                                placeholder="e.g., Production Website, Mobile App"
                                value={newKeyName}
                                onChange={(e) => setNewKeyName(e.target.value)}
                                className="max-w-sm"
                                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                            />
                            <Button onClick={handleCreate} disabled={isCreating}>
                                {isCreating ? 'Generating...' : 'Generate Key'}
                            </Button>
                            <Button variant="ghost" onClick={() => setShowCreateForm(false)}>
                                Cancel
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Quick start guide */}
            <Card>
                <CardHeader>
                    <CardTitle>Quick Start</CardTitle>
                    <CardDescription>Use your API key to authenticate requests</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="bg-muted rounded-lg p-4 font-mono text-sm space-y-2">
                        <div className="text-muted-foreground"># List your events</div>
                        <div className="break-all">
                            curl -H &quot;Authorization: Bearer {'<your-api-key>'}&quot; \
                        </div>
                        <div className="pl-4 text-primary">
                            {typeof window !== 'undefined' ? window.location.origin : 'https://hanghut.com'}/api/v1/events
                        </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div className="bg-muted rounded-lg p-3">
                            <div className="font-semibold">GET</div>
                            <div className="text-muted-foreground text-xs">/api/v1/events</div>
                        </div>
                        <div className="bg-muted rounded-lg p-3">
                            <div className="font-semibold">GET</div>
                            <div className="text-muted-foreground text-xs">/api/v1/events/:id</div>
                        </div>
                        <div className="bg-muted rounded-lg p-3">
                            <div className="font-semibold">POST</div>
                            <div className="text-muted-foreground text-xs">/api/v1/checkouts</div>
                        </div>
                        <div className="bg-muted rounded-lg p-3">
                            <div className="font-semibold">GET</div>
                            <div className="text-muted-foreground text-xs">/api/v1/tickets/:id</div>
                        </div>
                    </div>
                    <div className="mt-4">
                        <Link href="/docs/api" target="_blank">
                            <Button variant="outline" className="w-full">
                                <ExternalLink className="h-4 w-4 mr-2" />
                                View Full API Documentation
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>

            {/* Existing keys */}
            <Card>
                <CardHeader>
                    <CardTitle>Your API Keys</CardTitle>
                    <CardDescription>
                        {activeKeys.length} of 5 active keys
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {keys.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Key className="h-12 w-12 mx-auto mb-3 opacity-30" />
                            <p>No API keys yet. Create one to get started.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {keys.map((key) => (
                                <div
                                    key={key.id}
                                    className={`flex items-center justify-between p-4 rounded-lg border ${
                                        key.is_active ? 'border-border bg-card' : 'border-border/50 bg-muted/30 opacity-60'
                                    }`}
                                >
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className={`p-2 rounded-lg ${key.is_active ? 'bg-primary/10' : 'bg-muted'}`}>
                                            <Key className={`h-4 w-4 ${key.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium truncate">{key.name}</span>
                                                <Badge variant={key.is_active ? 'default' : 'secondary'} className="text-xs">
                                                    {key.is_active ? 'Active' : 'Revoked'}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                                <code className="bg-muted px-1.5 py-0.5 rounded">{key.key_prefix}••••••••</code>
                                                <span>Created {formatDistanceToNow(new Date(key.created_at), { addSuffix: true })}</span>
                                                {key.last_used_at && (
                                                    <span>Last used {formatDistanceToNow(new Date(key.last_used_at), { addSuffix: true })}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {key.is_active ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                onClick={() => handleRevoke(key.id)}
                                                disabled={revokingId === key.id}
                                            >
                                                {revokingId === key.id ? 'Revoking...' : 'Revoke'}
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-muted-foreground hover:text-destructive"
                                                onClick={() => handleDelete(key.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
