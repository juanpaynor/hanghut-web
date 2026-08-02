'use client'

import { useState } from 'react'

interface Tier {
    id: string
    name: string
    description?: string | null
    price: number
    quantity_total: number
    quantity_sold: number
    is_active: boolean
    sort_order?: number | null
    perks?: string[] | null
    highlight?: boolean | null
    badge_label?: string | null
    accent_color?: string | null
}

interface Props {
    eventId: string
    tiers: Tier[]
    maxPerOrder?: number
}

const avail = (t: Tier) => Math.max(0, (t.quantity_total ?? 0) - (t.quantity_sold ?? 0))

export function EmbedTierSelector({ eventId, tiers, maxPerOrder = 10 }: Props) {
    const active = tiers
        .filter((t) => t.is_active)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.price - b.price)
    const firstAvailable = active.find((t) => avail(t) > 0)

    const [selectedId, setSelectedId] = useState<string | null>(firstAvailable?.id ?? null)
    const [qty, setQty] = useState(1)

    const selected = active.find((t) => t.id === selectedId) ?? null
    const maxQty = selected ? Math.min(avail(selected), maxPerOrder) : 0
    const allSold = active.length > 0 && active.every((t) => avail(t) <= 0)

    const selectTier = (t: Tier) => {
        if (avail(t) <= 0) return
        setSelectedId(t.id)
        setQty(1)
    }

    const changeQty = (delta: number) => {
        setQty((q) => Math.max(1, Math.min(q + delta, Math.max(1, maxQty))))
    }

    const handleCheckout = () => {
        if (!selected || avail(selected) <= 0) return
        const url = `${window.location.origin}/checkout?eventId=${eventId}&tierId=${selected.id}&quantity=${qty}&embed=true`
        window.parent.postMessage({ type: 'HANGHUT_OPEN_CHECKOUT', url }, '*')
    }

    const subtotal = selected ? selected.price * qty : 0

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Tier rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {active.map((t) => {
                    const remaining = avail(t)
                    const soldOut = remaining <= 0
                    const isSelected = t.id === selectedId
                    const lowStock = !soldOut && remaining <= 10
                    const accent = t.accent_color || undefined
                    const selColor = accent || 'var(--embed-primary, #000)'
                    const perks = Array.isArray(t.perks) ? t.perks : []

                    return (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => selectTier(t)}
                            disabled={soldOut}
                            style={{
                                width: '100%',
                                textAlign: 'left',
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between',
                                gap: '12px',
                                padding: '12px 14px',
                                borderRadius: '10px',
                                cursor: soldOut ? 'not-allowed' : 'pointer',
                                background: 'var(--embed-bg, #fff)',
                                border: isSelected ? `2px solid ${selColor}` : '1px solid rgba(128,128,128,0.25)',
                                opacity: soldOut ? 0.5 : 1,
                                transition: 'border-color 0.15s',
                                font: 'inherit',
                                color: 'var(--embed-text, inherit)',
                            }}
                        >
                            <span style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    {accent && (
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: accent, flexShrink: 0 }} />
                                    )}
                                    <span style={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {t.name}
                                    </span>
                                    {(t.highlight || t.badge_label) && (
                                        <span style={{
                                            fontSize: '9px', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase',
                                            padding: '2px 6px', borderRadius: '999px', flexShrink: 0,
                                            ...(t.highlight
                                                ? { background: selColor, color: '#fff' }
                                                : { border: `1px solid ${accent || 'rgba(128,128,128,0.4)'}`, color: accent || 'var(--embed-text, #666)' }),
                                        }}>
                                            {t.badge_label || 'Featured'}
                                        </span>
                                    )}
                                </span>
                                {t.description && (
                                    <span style={{ fontSize: '12px', color: 'var(--embed-text, #777)', opacity: 0.85 }}>{t.description}</span>
                                )}
                                {perks.length > 0 && (
                                    <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                                        {perks.map((perk, i) => (
                                            <span key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '11.5px', color: 'var(--embed-text, #666)' }}>
                                                <span style={{ color: accent || 'var(--embed-primary, #16a34a)', flexShrink: 0, lineHeight: 1.3 }}>✓</span>
                                                {perk}
                                            </span>
                                        ))}
                                    </span>
                                )}
                                <span style={{ fontSize: '11px', color: soldOut ? '#ef4444' : (lowStock ? '#f59e0b' : 'var(--embed-text, #888)'), fontWeight: soldOut || lowStock ? 600 : 400, marginTop: '1px' }}>
                                    {soldOut ? 'Sold out' : lowStock ? `Only ${remaining} left` : 'Available'}
                                </span>
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                                <span style={{ fontWeight: 700, fontSize: '14px' }}>
                                    {t.price === 0 ? 'Free' : `₱${t.price.toLocaleString()}`}
                                </span>
                                {/* Radio indicator */}
                                <span style={{
                                    width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                                    border: isSelected ? `5px solid ${selColor}` : '2px solid rgba(128,128,128,0.4)',
                                    boxSizing: 'border-box',
                                }} />
                            </span>
                        </button>
                    )
                })}
            </div>

            {/* Quantity stepper */}
            {selected && !allSold && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 4px', marginTop: '2px',
                }}>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--embed-text, #555)' }}>Quantity</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <button
                            type="button"
                            onClick={() => changeQty(-1)}
                            disabled={qty <= 1}
                            aria-label="Decrease quantity"
                            style={stepBtn(qty <= 1)}
                        >−</button>
                        <span style={{ minWidth: '20px', textAlign: 'center', fontWeight: 700, fontSize: '15px', color: 'var(--embed-text, inherit)' }}>{qty}</span>
                        <button
                            type="button"
                            onClick={() => changeQty(1)}
                            disabled={qty >= maxQty}
                            aria-label="Increase quantity"
                            style={stepBtn(qty >= maxQty)}
                        >+</button>
                    </span>
                </div>
            )}

            {/* CTA */}
            <button
                type="button"
                onClick={handleCheckout}
                disabled={allSold || !selected}
                style={{
                    width: '100%',
                    padding: '13px 20px',
                    borderRadius: '10px',
                    border: 'none',
                    fontSize: '15px',
                    fontWeight: 700,
                    cursor: allSold || !selected ? 'not-allowed' : 'pointer',
                    background: allSold || !selected ? '#e5e7eb' : 'var(--embed-primary, #000)',
                    color: allSold || !selected ? '#9ca3af' : '#fff',
                    letterSpacing: '-0.01em',
                    fontFamily: 'inherit',
                    marginTop: '2px',
                }}
            >
                {allSold
                    ? 'Sold Out'
                    : subtotal > 0
                        ? `Get Tickets · ₱${subtotal.toLocaleString()}`
                        : 'Get Tickets'}
            </button>
        </div>
    )
}

function stepBtn(disabled: boolean): React.CSSProperties {
    return {
        width: '30px', height: '30px', borderRadius: '8px',
        border: '1px solid rgba(128,128,128,0.3)',
        background: 'var(--embed-bg, #fff)',
        color: 'var(--embed-text, inherit)',
        fontSize: '18px', lineHeight: 1, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'inherit',
    }
}
