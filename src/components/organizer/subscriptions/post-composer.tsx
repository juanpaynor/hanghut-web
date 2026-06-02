'use client'

import { useState, useTransition } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Send } from 'lucide-react'
import { createSubscriptionPost } from '@/lib/subscriptions/actions'

interface Tier { id: string; name: string; price_monthly: number }

export function PostComposer({ tiers }: { tiers: Tier[] }) {
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()
    const [form, setForm] = useState({
        tier_id: '',
        title: '',
        body: '',
        gated_url: '',
        gated_url_label: '',
        publish: true,
    })

    const handleSubmit = () => {
        if (!form.tier_id || !form.title.trim() || !form.body.trim()) return
        startTransition(async () => {
            const result = await createSubscriptionPost(form)
            if (result.error) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            } else {
                toast({ title: form.publish ? 'Post published' : 'Draft saved' })
                setForm({ tier_id: '', title: '', body: '', gated_url: '', gated_url_label: '', publish: true })
            }
        })
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">New Post</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-1.5">
                    <Label>Minimum Tier Required</Label>
                    <Select value={form.tier_id} onValueChange={v => setForm(f => ({ ...f, tier_id: v }))}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select tier…" />
                        </SelectTrigger>
                        <SelectContent>
                            {tiers.map(t => (
                                <SelectItem key={t.id} value={t.id}>
                                    {t.name} — ₱{Number(t.price_monthly).toLocaleString()}/mo
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label>Title</Label>
                    <Input
                        placeholder="Post title"
                        value={form.title}
                        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label>Body</Label>
                    <Textarea
                        placeholder="Write your exclusive content…"
                        rows={5}
                        value={form.body}
                        onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label>Gated Link <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input
                        placeholder="https://youtube.com/…"
                        value={form.gated_url}
                        onChange={e => setForm(f => ({ ...f, gated_url: e.target.value }))}
                    />
                    {form.gated_url && (
                        <Input
                            placeholder="Link label e.g. Watch on YouTube"
                            value={form.gated_url_label}
                            onChange={e => setForm(f => ({ ...f, gated_url_label: e.target.value }))}
                        />
                    )}
                </div>
                <div className="flex items-center justify-between">
                    <Label>Publish immediately</Label>
                    <Switch
                        checked={form.publish}
                        onCheckedChange={v => setForm(f => ({ ...f, publish: v }))}
                    />
                </div>
            </CardContent>
            <CardFooter>
                <Button
                    className="w-full"
                    onClick={handleSubmit}
                    disabled={isPending || !form.tier_id || !form.title || !form.body}
                >
                    {isPending
                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
                        : <><Send className="h-4 w-4 mr-2" />{form.publish ? 'Publish Post' : 'Save Draft'}</>
                    }
                </Button>
            </CardFooter>
        </Card>
    )
}
