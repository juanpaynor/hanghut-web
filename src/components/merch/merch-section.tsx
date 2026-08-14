'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Shirt, Plus, Minus, ShoppingBag, Loader2, X, Trash2, PackageCheck, Truck } from 'lucide-react'
import type { PublicMerchProduct, PublicMerchVariant } from '@/lib/merch/public-actions'

const peso = (n: number) => (n === 0 ? 'Free' : `₱${Number(n).toLocaleString()}`)

interface CartLine { productId: string; productName: string; image?: string; variant: PublicMerchVariant; qty: number }

interface Props {
    organizerId: string
    eventId?: string
    products: PublicMerchProduct[]
}

export function MerchSection({ eventId, products }: Props) {
    const [cart, setCart] = useState<Record<string, CartLine>>({})
    const [checkoutOpen, setCheckoutOpen] = useState(false)

    const lines = Object.values(cart)
    const total = lines.reduce((s, l) => s + l.variant.price * l.qty, 0)
    const count = lines.reduce((s, l) => s + l.qty, 0)

    // Fulfillment modes the whole cart supports (intersection).
    const cartModes = useMemo(() => {
        const modesFor = (m: string) => (m === 'both' ? ['claim', 'ship'] : [m])
        let allowed = ['claim', 'ship']
        for (const l of lines) {
            const p = products.find(x => x.id === l.productId)
            if (p) allowed = allowed.filter(a => modesFor(p.fulfillment_mode).includes(a))
        }
        return allowed
    }, [lines, products])

    function addToCart(product: PublicMerchProduct, variant: PublicMerchVariant) {
        setCart(prev => {
            const existing = prev[variant.id]
            const qty = (existing?.qty ?? 0) + 1
            return { ...prev, [variant.id]: { productId: product.id, productName: product.name, image: product.images[0], variant, qty } }
        })
    }
    function setQty(variantId: string, qty: number) {
        setCart(prev => {
            if (qty <= 0) { const n = { ...prev }; delete n[variantId]; return n }
            return { ...prev, [variantId]: { ...prev[variantId], qty } }
        })
    }

    if (products.length === 0) return null

    return (
        <section className="space-y-5">
            <div className="flex items-center gap-2">
                <Shirt className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold">Merch</h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                {products.map(product => (
                    <ProductCard key={product.id} product={product} onAdd={addToCart} />
                ))}
            </div>

            {/* Sticky cart bar */}
            {count > 0 && (
                <div className="sticky bottom-4 z-20 flex items-center justify-between rounded-xl border bg-card text-card-foreground shadow-lg p-3">
                    <div className="flex items-center gap-2 text-sm">
                        <ShoppingBag className="h-4 w-4" />
                        <span className="font-semibold">{count} item{count === 1 ? '' : 's'}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-bold">{peso(total)}</span>
                    </div>
                    <Button size="sm" onClick={() => setCheckoutOpen(true)}>Checkout</Button>
                </div>
            )}

            {checkoutOpen && (
                <CheckoutDialog
                    lines={lines}
                    total={total}
                    eventId={eventId}
                    allowedModes={cartModes}
                    onClose={() => setCheckoutOpen(false)}
                    onSetQty={setQty}
                />
            )}
        </section>
    )
}

function ProductCard({ product, onAdd }: { product: PublicMerchProduct; onAdd: (p: PublicMerchProduct, v: PublicMerchVariant) => void }) {
    const [selected, setSelected] = useState<string>(product.variants[0]?.id ?? '')
    const variant = product.variants.find(v => v.id === selected) ?? product.variants[0]
    const soldOut = variant && variant.quantity_total != null && variant.quantity_sold >= variant.quantity_total

    return (
        <div className="rounded-xl border p-4 flex flex-col">
            <div className="relative aspect-square w-full rounded-lg bg-muted overflow-hidden mb-3">
                {product.images[0]
                    ? <Image src={product.images[0]} alt={product.name} fill className="object-cover" sizes="(max-width:640px) 100vw, 300px" />
                    : <Shirt className="h-10 w-10 text-muted-foreground/30 absolute inset-0 m-auto" />}
            </div>
            <div className="flex items-center gap-2">
                <span className="font-semibold">{product.name}</span>
                <Badge variant="outline" className="text-[10px] h-5 gap-1 ml-auto">
                    {product.fulfillment_mode === 'ship' ? <Truck className="h-3 w-3" /> : <PackageCheck className="h-3 w-3" />}
                    {product.fulfillment_mode === 'ship' ? 'Ships' : 'At event'}
                </Badge>
            </div>
            {product.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{product.description}</p>}

            {product.variants.length > 1 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                    {product.variants.map(v => {
                        const vSoldOut = v.quantity_total != null && v.quantity_sold >= v.quantity_total
                        return (
                            <button key={v.id} onClick={() => setSelected(v.id)} disabled={vSoldOut}
                                className={`text-xs rounded-full border px-2.5 py-1 transition-colors ${selected === v.id ? 'border-primary bg-primary/10 font-medium' : 'border-border'} ${vSoldOut ? 'opacity-40 line-through cursor-not-allowed' : ''}`}>
                                {v.name}
                            </button>
                        )
                    })}
                </div>
            )}

            <div className="flex items-center justify-between mt-3 pt-3 border-t">
                <span className="text-lg font-extrabold">{peso(variant?.price ?? 0)}</span>
                <Button size="sm" disabled={soldOut} onClick={() => variant && onAdd(product, variant)}>
                    {soldOut ? 'Sold out' : <><Plus className="mr-1 h-4 w-4" /> Add</>}
                </Button>
            </div>
        </div>
    )
}

function CheckoutDialog({ lines, total, eventId, allowedModes, onClose, onSetQty }: {
    lines: CartLine[]
    total: number
    eventId?: string
    allowedModes: string[]
    onClose: () => void
    onSetQty: (variantId: string, qty: number) => void
}) {
    const [email, setEmail] = useState('')
    const [name, setName] = useState('')
    const [phone, setPhone] = useState('')
    const [mode, setMode] = useState<'claim' | 'ship'>(allowedModes.includes('claim') ? 'claim' : 'ship')
    const [address, setAddress] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const canShip = allowedModes.includes('ship')
    const canClaim = allowedModes.includes('claim')

    async function pay() {
        setError('')
        if (!email.trim() || !name.trim()) { setError('Name and email are required.'); return }
        if (mode === 'ship' && !address.trim()) { setError('Shipping address is required.'); return }
        setLoading(true)
        try {
            const supabase = createClient()
            const { data, error: fnError } = await supabase.functions.invoke('create-merch-intent', {
                body: {
                    items: lines.map(l => ({ variant_id: l.variant.id, quantity: l.qty })),
                    guest_details: { email: email.trim(), name: name.trim(), phone: phone.trim() },
                    event_id: eventId ?? null,
                    fulfillment_mode: mode,
                    shipping_address: mode === 'ship' ? { raw: address.trim() } : null,
                    success_url: `${window.location.origin}/merch/success`,
                    failure_url: window.location.href,
                },
            })
            if (fnError) throw new Error(fnError.message)
            if (!data?.success || !data?.data?.payment_url) throw new Error(data?.error || 'Could not start checkout')
            window.location.href = data.data.payment_url
        } catch (e: any) {
            setError(e.message || 'Checkout failed')
            setLoading(false)
        }
    }

    return (
        <Dialog open onOpenChange={o => !o && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Checkout</DialogTitle></DialogHeader>
                <div className="space-y-4">
                    {/* Cart lines */}
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                        {lines.map(l => (
                            <div key={l.variant.id} className="flex items-center gap-2 text-sm">
                                <span className="flex-1 truncate">{l.productName} · {l.variant.name}</span>
                                <div className="flex items-center gap-1.5">
                                    <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => onSetQty(l.variant.id, l.qty - 1)}><Minus className="h-3 w-3" /></Button>
                                    <span className="w-5 text-center">{l.qty}</span>
                                    <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => onSetQty(l.variant.id, l.qty + 1)}><Plus className="h-3 w-3" /></Button>
                                </div>
                                <span className="w-16 text-right font-medium">{peso(l.variant.price * l.qty)}</span>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between font-bold border-t pt-2"><span>Total</span><span>{peso(total)}</span></div>

                    {/* Fulfillment */}
                    {canShip && canClaim && (
                        <div className="flex gap-2">
                            <button onClick={() => setMode('claim')} className={`flex-1 rounded-lg border p-2 text-sm ${mode === 'claim' ? 'border-primary bg-primary/5 font-medium' : ''}`}>
                                <PackageCheck className="h-4 w-4 mx-auto mb-1" /> Claim at event
                            </button>
                            <button onClick={() => setMode('ship')} className={`flex-1 rounded-lg border p-2 text-sm ${mode === 'ship' ? 'border-primary bg-primary/5 font-medium' : ''}`}>
                                <Truck className="h-4 w-4 mx-auto mb-1" /> Ship to me
                            </button>
                        </div>
                    )}

                    {/* Contact */}
                    <div className="grid gap-3">
                        <div className="space-y-1.5"><Label>Full name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Juan Dela Cruz" /></div>
                        <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" /></div>
                        <div className="space-y-1.5"><Label>Phone</Label><Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="09171234567" /></div>
                        {mode === 'ship' && (
                            <div className="space-y-1.5"><Label>Shipping address</Label><Textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} placeholder="Unit, street, city, province, ZIP" /></div>
                        )}
                    </div>

                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={pay} disabled={loading}>
                        {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecting…</> : `Pay ${peso(total)}`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
