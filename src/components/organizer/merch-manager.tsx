'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
    Plus, Shirt, Trash2, Loader2, ImagePlus, Power, Pencil, X, PackageCheck, Truck,
} from 'lucide-react'
import {
    createMerchProduct, updateMerchProduct, deleteMerchProduct,
    createMerchVariant, updateMerchVariant, deleteMerchVariant, uploadMerchImage,
    type MerchProduct, type MerchVariant, type FulfillmentMode,
} from '@/lib/organizer/merch-actions'

const peso = (n: number) => `₱${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

const FULFILLMENT_LABEL: Record<FulfillmentMode, string> = {
    claim: 'Claim at event',
    ship: 'Ship to buyer',
    both: 'Claim or ship',
}

interface Props {
    organizerId: string
    events: { id: string; title: string }[]
    initialProducts: MerchProduct[]
}

export function MerchManager({ organizerId, events, initialProducts }: Props) {
    const [products, setProducts] = useState<MerchProduct[]>(initialProducts)
    const [editing, setEditing] = useState<MerchProduct | null>(null)
    const [creating, setCreating] = useState(false)

    function upsertProduct(p: MerchProduct) {
        setProducts(prev => prev.some(x => x.id === p.id) ? prev.map(x => x.id === p.id ? p : x) : [p, ...prev])
    }

    async function toggleActive(p: MerchProduct) {
        const next = !p.is_active
        upsertProduct({ ...p, is_active: next })
        await updateMerchProduct(p.id, { is_active: next })
    }

    async function removeProduct(p: MerchProduct) {
        if (!confirm(`Delete "${p.name}"?`)) return
        const prev = products
        setProducts(products.filter(x => x.id !== p.id))
        const res = await deleteMerchProduct(p.id)
        if ('error' in res && res.error) { setProducts(prev); alert(res.error) }
    }

    return (
        <div className="space-y-5">
            <div className="flex justify-end">
                <Button onClick={() => setCreating(true)}><Plus className="mr-2 h-4 w-4" /> New product</Button>
            </div>

            {products.length === 0 ? (
                <Card className="p-10 text-center">
                    <Shirt className="h-10 w-10 mx-auto text-muted-foreground/40" />
                    <p className="mt-3 font-medium">No merch yet</p>
                    <p className="text-sm text-muted-foreground">Add a product, give it variants (size/color), and sell it on your event page.</p>
                </Card>
            ) : (
                <div className="space-y-4">
                    {products.map(p => (
                        <ProductCard key={p.id} product={p} events={events}
                            onEdit={() => setEditing(p)}
                            onToggle={() => toggleActive(p)}
                            onDelete={() => removeProduct(p)}
                            onChange={upsertProduct}
                        />
                    ))}
                </div>
            )}

            {(creating || editing) && (
                <ProductDialog
                    organizerId={organizerId}
                    events={events}
                    product={editing}
                    onClose={() => { setCreating(false); setEditing(null) }}
                    onSaved={(p) => { upsertProduct(p); setCreating(false); setEditing(null) }}
                />
            )}
        </div>
    )
}

function ProductCard({ product, events, onEdit, onToggle, onDelete, onChange }: {
    product: MerchProduct
    events: { id: string; title: string }[]
    onEdit: () => void
    onToggle: () => void
    onDelete: () => void
    onChange: (p: MerchProduct) => void
}) {
    const eventTitle = product.event_id ? events.find(e => e.id === product.event_id)?.title : null

    function setVariants(variants: MerchVariant[]) { onChange({ ...product, variants }) }

    return (
        <Card className={`p-4 ${product.is_active ? '' : 'opacity-60'}`}>
            <div className="flex items-start gap-4">
                <div className="relative h-16 w-16 shrink-0 rounded-lg bg-muted overflow-hidden">
                    {product.images[0]
                        ? <Image src={product.images[0]} alt="" fill className="object-cover" sizes="64px" />
                        : <Shirt className="h-6 w-6 text-muted-foreground/40 absolute inset-0 m-auto" />}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold truncate">{product.name}</span>
                        {!product.is_active && <Badge variant="secondary" className="text-[10px] h-5">Hidden</Badge>}
                        <Badge variant="outline" className="text-[10px] h-5 gap-1">
                            {product.fulfillment_mode === 'ship' ? <Truck className="h-3 w-3" /> : <PackageCheck className="h-3 w-3" />}
                            {FULFILLMENT_LABEL[product.fulfillment_mode]}
                        </Badge>
                        {eventTitle && <Badge variant="outline" className="text-[10px] h-5 max-w-[160px] truncate">{eventTitle}</Badge>}
                    </div>
                    {product.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{product.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggle} title={product.is_active ? 'Hide' : 'Show'}>
                        <Power className={`h-4 w-4 ${product.is_active ? 'text-green-600' : 'text-muted-foreground'}`} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} title="Edit"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete} title="Delete"><Trash2 className="h-4 w-4" /></Button>
                </div>
            </div>

            <VariantEditor product={product} onChange={setVariants} />
        </Card>
    )
}

function VariantEditor({ product, onChange }: { product: MerchProduct; onChange: (v: MerchVariant[]) => void }) {
    const [name, setName] = useState('')
    const [price, setPrice] = useState('')
    const [stock, setStock] = useState('')
    const [adding, setAdding] = useState(false)

    async function add() {
        if (!name.trim() || !price) return
        setAdding(true)
        const res = await createMerchVariant({
            productId: product.id, name: name.trim(), price: Number(price),
            quantity_total: stock ? Number(stock) : null,
        })
        setAdding(false)
        if ('variant' in res && res.variant) {
            onChange([...product.variants, res.variant])
            setName(''); setPrice(''); setStock('')
        } else if ('error' in res && res.error) alert(res.error)
    }

    async function saveField(v: MerchVariant, patch: Partial<MerchVariant>) {
        onChange(product.variants.map(x => x.id === v.id ? { ...x, ...patch } : x))
        await updateMerchVariant(v.id, patch as any)
    }

    async function remove(v: MerchVariant) {
        const prev = product.variants
        onChange(product.variants.filter(x => x.id !== v.id))
        const res = await deleteMerchVariant(v.id)
        if ('error' in res && res.error) { onChange(prev); alert(res.error) }
    }

    return (
        <div className="mt-4 border-t pt-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">Variants</div>
            <div className="space-y-2">
                {product.variants.map(v => (
                    <div key={v.id} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 truncate">{v.name}</span>
                        <div className="flex items-center gap-1">
                            <span className="text-muted-foreground text-xs">₱</span>
                            <Input type="number" defaultValue={v.price} onBlur={e => { const n = Number(e.target.value); if (n !== v.price) saveField(v, { price: n }) }}
                                className="h-8 w-20" />
                        </div>
                        <Input type="number" defaultValue={v.quantity_total ?? ''} placeholder="∞"
                            onBlur={e => { const val = e.target.value === '' ? null : Number(e.target.value); if (val !== v.quantity_total) saveField(v, { quantity_total: val }) }}
                            className="h-8 w-20" title="Stock (blank = unlimited)" />
                        <span className="text-[11px] text-muted-foreground w-14 text-right">{v.quantity_sold} sold</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(v)}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                ))}
            </div>
            <div className="flex items-end gap-2 mt-3">
                <div className="flex-1"><Label className="text-xs">Variant</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Black / L" className="h-8" /></div>
                <div><Label className="text-xs">Price</Label><Input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="500" className="h-8 w-24" /></div>
                <div><Label className="text-xs">Stock</Label><Input type="number" value={stock} onChange={e => setStock(e.target.value)} placeholder="∞" className="h-8 w-20" /></div>
                <Button size="sm" onClick={add} disabled={adding || !name.trim() || !price}>
                    {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
            </div>
        </div>
    )
}

function ProductDialog({ organizerId, events, product, onClose, onSaved }: {
    organizerId: string
    events: { id: string; title: string }[]
    product: MerchProduct | null
    onClose: () => void
    onSaved: (p: MerchProduct) => void
}) {
    const [name, setName] = useState(product?.name ?? '')
    const [description, setDescription] = useState(product?.description ?? '')
    const [eventId, setEventId] = useState<string>(product?.event_id ?? 'none')
    const [mode, setMode] = useState<FulfillmentMode>(product?.fulfillment_mode ?? 'claim')
    const [images, setImages] = useState<string[]>(product?.images ?? [])
    const [saving, setSaving] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState('')
    const fileRef = useRef<HTMLInputElement>(null)

    async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        setUploading(true)
        const fd = new FormData()
        fd.append('file', file); fd.append('organizerId', organizerId)
        const res = await uploadMerchImage(fd)
        setUploading(false)
        if (res.url) setImages(prev => [...prev, res.url!])
        else setError(res.error || 'Upload failed')
        if (fileRef.current) fileRef.current.value = ''
    }

    async function save() {
        setError('')
        if (!name.trim()) { setError('Name is required'); return }
        setSaving(true)
        const evId = eventId === 'none' ? null : eventId
        if (product) {
            const res = await updateMerchProduct(product.id, { name: name.trim(), description: description.trim() || null, event_id: evId, images, fulfillment_mode: mode })
            setSaving(false)
            if ('error' in res && res.error) { setError(res.error); return }
            onSaved({ ...product, name: name.trim(), description: description.trim() || null, event_id: evId, images, fulfillment_mode: mode })
        } else {
            const res = await createMerchProduct({ organizerId, name: name.trim(), description: description.trim(), eventId: evId, images, fulfillment_mode: mode })
            setSaving(false)
            if ('error' in res && res.error) { setError(res.error); return }
            if ('product' in res && res.product) onSaved(res.product)
        }
    }

    return (
        <Dialog open onOpenChange={o => !o && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>{product ? 'Edit product' : 'New product'}</DialogTitle></DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Tour Shirt 2026" /></div>
                    <div className="space-y-1.5"><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Soft cotton, unisex fit." /></div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Fulfillment</Label>
                            <Select value={mode} onValueChange={v => setMode(v as FulfillmentMode)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="claim">Claim at event</SelectItem>
                                    <SelectItem value="ship">Ship to buyer</SelectItem>
                                    <SelectItem value="both">Claim or ship</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Link to event</Label>
                            <Select value={eventId} onValueChange={setEventId}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Storefront-wide</SelectItem>
                                    {events.map(e => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Images</Label>
                        <div className="flex flex-wrap gap-2">
                            {images.map((url, i) => (
                                <div key={i} className="relative h-16 w-16 rounded-lg overflow-hidden border">
                                    <Image src={url} alt="" fill className="object-cover" sizes="64px" />
                                    <button onClick={() => setImages(images.filter((_, j) => j !== i))}
                                        className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5"><X className="h-3 w-3 text-white" /></button>
                                </div>
                            ))}
                            <button onClick={() => fileRef.current?.click()} disabled={uploading}
                                className="h-16 w-16 rounded-lg border-2 border-dashed flex items-center justify-center text-muted-foreground hover:border-primary/50">
                                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                            </button>
                            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
                        </div>
                    </div>

                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={save} disabled={saving}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : 'Save'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
