'use client'

import { SectionType } from '@/lib/storefront/section-types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'

interface SectionConfigPanelProps {
    type: SectionType
    config: Record<string, any>
    onChange: (config: Record<string, any>) => void
}

export function SectionConfigPanel({ type, config, onChange }: SectionConfigPanelProps) {
    const update = (key: string, value: any) => {
        onChange({ ...config, [key]: value })
    }

    switch (type) {
        case 'hero':
            return (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Hero Style</Label>
                        <Select value={config.variant || 'fullbleed'} onValueChange={(v) => update('variant', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="fullbleed">Full Bleed (Immersive Cover)</SelectItem>
                                <SelectItem value="split">Split (Image + Text)</SelectItem>
                                <SelectItem value="minimal">Minimal (Text Only)</SelectItem>
                                <SelectItem value="video">Video Hero</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Height</Label>
                            <Select value={config.height || 'default'} onValueChange={(v) => update('height', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="short">Short</SelectItem>
                                    <SelectItem value="default">Default</SelectItem>
                                    <SelectItem value="tall">Tall</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Content Position</Label>
                            <Select value={config.content_position || 'bottom'} onValueChange={(v) => update('content_position', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="bottom">Bottom</SelectItem>
                                    <SelectItem value="center">Center</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Overlay Darkness (For images/video)</Label>
                        <Select value={config.overlay_opacity || 'gradient'} onValueChange={(v) => update('overlay_opacity', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">No Overlay</SelectItem>
                                <SelectItem value="gradient">Bottom Gradient (Default)</SelectItem>
                                <SelectItem value="light">Light Darkening</SelectItem>
                                <SelectItem value="medium">Medium Darkening</SelectItem>
                                <SelectItem value="dark">Heavy Darkening</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Custom Hero Logo URL (Optional)</Label>
                        <Input
                            value={config.hero_logo_url || ''}
                            onChange={(e) => update('hero_logo_url', e.target.value)}
                            placeholder="https://example.com/logo.png"
                        />
                        <p className="text-xs text-muted-foreground">Replaces your circular profile photo with a custom festival-style graphic banner.</p>
                    </div>
                    <div className="space-y-2">
                        <Label>Overlay Text (Optional)</Label>
                        <Input
                            value={config.overlay_text || ''}
                            onChange={(e) => update('overlay_text', e.target.value)}
                            placeholder="e.g. Welcome to our events"
                        />
                        <p className="text-xs text-muted-foreground">Defaults to your organization name if empty.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>CTA Button Text</Label>
                            <Input
                                value={config.cta_text || ''}
                                onChange={(e) => update('cta_text', e.target.value)}
                                placeholder="e.g. Browse Events"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>CTA Button Link</Label>
                            <Input
                                value={config.cta_link || ''}
                                onChange={(e) => update('cta_link', e.target.value)}
                                placeholder="e.g. #events"
                            />
                        </div>
                    </div>
                </div>
            )

        case 'about':
            return (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Layout</Label>
                        <Select value={config.variant || 'centered'} onValueChange={(v) => update('variant', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="centered">Centered</SelectItem>
                                <SelectItem value="left-aligned">Left Aligned</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Content comes from your Bio/Description in General settings. Use Rich Description (HTML) for formatted content.
                    </p>
                </div>
            )

        case 'events':
            return (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Display Style</Label>
                        <Select value={config.variant || 'grid'} onValueChange={(v) => update('variant', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="grid">Card Grid</SelectItem>
                                <SelectItem value="list">List View</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {config.variant !== 'list' && (
                        <div className="space-y-2">
                            <Label>Columns</Label>
                            <Select value={String(config.columns || 2)} onValueChange={(v) => update('columns', Number(v))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="2">2 Columns</SelectItem>
                                    <SelectItem value="3">3 Columns</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
            )

        case 'past_events':
            return (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Columns</Label>
                        <Select value={String(config.columns || 2)} onValueChange={(v) => update('columns', Number(v))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="2">2 Columns</SelectItem>
                                <SelectItem value="3">3 Columns</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">Shows your most recent completed events with a grayscale effect.</p>
                </div>
            )

        case 'newsletter':
            return (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Style</Label>
                        <Select value={config.variant || 'banner'} onValueChange={(v) => update('variant', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="banner">Full-Width Banner</SelectItem>
                                <SelectItem value="inline">Compact Inline</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Heading</Label>
                        <Input
                            value={config.heading || ''}
                            onChange={(e) => update('heading', e.target.value)}
                            placeholder="Stay in the loop"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Subheading</Label>
                        <Input
                            value={config.subheading || ''}
                            onChange={(e) => update('subheading', e.target.value)}
                            placeholder="Get notified about upcoming events"
                        />
                    </div>
                </div>
            )

        case 'stats':
            return <StatsConfigPanel items={config.items || []} onChange={(items) => update('items', items)} />

        case 'cta':
            return (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Heading</Label>
                        <Input
                            value={config.heading || ''}
                            onChange={(e) => update('heading', e.target.value)}
                            placeholder="Ready to join?"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Subheading</Label>
                        <Input
                            value={config.subheading || ''}
                            onChange={(e) => update('subheading', e.target.value)}
                            placeholder="Browse our upcoming events"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Button Text</Label>
                            <Input
                                value={config.button_text || ''}
                                onChange={(e) => update('button_text', e.target.value)}
                                placeholder="Learn More"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Button Link</Label>
                            <Input
                                value={config.button_link || ''}
                                onChange={(e) => update('button_link', e.target.value)}
                                placeholder="#events"
                            />
                        </div>
                    </div>
                </div>
            )

        case 'divider':
            return (
                <div className="space-y-2">
                    <Label>Style</Label>
                    <Select value={config.style || 'line'} onValueChange={(v) => update('style', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="line">Line</SelectItem>
                            <SelectItem value="dots">Dots</SelectItem>
                            <SelectItem value="space">Empty Space</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            )

        case 'gallery':
            return (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Layout</Label>
                        <Select value={config.variant || 'grid'} onValueChange={(v) => update('variant', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="grid">Grid</SelectItem>
                                <SelectItem value="masonry">Masonry</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Columns</Label>
                        <Select value={String(config.columns || 3)} onValueChange={(v) => update('columns', Number(v))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="2">2 Columns</SelectItem>
                                <SelectItem value="3">3 Columns</SelectItem>
                                <SelectItem value="4">4 Columns</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">Gallery image upload coming soon. You can add image URLs manually in the data.</p>
                </div>
            )

        default:
            return <p className="text-sm text-muted-foreground">No configuration available for this section.</p>
    }
}

// ── Stats sub-editor ────────────────────────────────────────

function StatsConfigPanel({
    items,
    onChange,
}: {
    items: Array<{ label: string; value: string }>
    onChange: (items: Array<{ label: string; value: string }>) => void
}) {
    const updateItem = (index: number, field: 'label' | 'value', val: string) => {
        const newItems = [...items]
        newItems[index] = { ...newItems[index], [field]: val }
        onChange(newItems)
    }

    const addItem = () => {
        onChange([...items, { label: 'Label', value: '0' }])
    }

    const removeItem = (index: number) => {
        onChange(items.filter((_, i) => i !== index))
    }

    return (
        <div className="space-y-3">
            <Label>Stats Items</Label>
            {items.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                    <Input
                        value={item.value}
                        onChange={(e) => updateItem(i, 'value', e.target.value)}
                        placeholder="50+"
                        className="w-24 font-mono"
                    />
                    <Input
                        value={item.label}
                        onChange={(e) => updateItem(i, 'label', e.target.value)}
                        placeholder="Events Hosted"
                        className="flex-1"
                    />
                    <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removeItem(i)}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                </div>
            ))}
            {items.length < 6 && (
                <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-2">
                    <Plus className="h-3.5 w-3.5" /> Add Stat
                </Button>
            )}
        </div>
    )
}
