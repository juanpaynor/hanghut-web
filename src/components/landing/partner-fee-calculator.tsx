"use client";

import { useState } from "react";
import { computePlatformTake, DEFAULT_PLATFORM_PCT, DEFAULT_FIXED_FEE } from "@/lib/payment/platform-fees";
import { getProcessingFee } from "@/lib/payment/processing-fees";
import { Calculator, TrendingUp, Check } from "lucide-react";

const METHODS = [
    { key: "QRPH", label: "QR Ph", hint: "1.4%" },
    { key: "GCASH", label: "GCash", hint: "2.3%" },
    { key: "CARDS", label: "Card", hint: "3.2% + ₱10" },
] as const;

const PRESETS = [
    { label: "₱500 gig", price: 500, qty: 120 },
    { label: "₱1,500 workshop", price: 1500, qty: 40 },
    { label: "₱3,000 conference", price: 3000, qty: 200 },
    { label: "Free event", price: 0, qty: 200 },
];

// Representative rate for a typical competing ticketing platform (they quote 7–15%).
const COMPETITOR_PCT = 10;

const peso = (n: number) =>
    `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pesoShort = (n: number) => `₱${Math.round(n).toLocaleString()}`;

/**
 * Interactive "what will I keep?" calculator. Uses the SAME formula as
 * checkout/create-purchase-intent (platform-fees.ts + processing-fees.ts) so the
 * numbers match reality. Shows both fee modes side by side + savings vs a typical
 * 10% platform.
 */
export function PartnerFeeCalculator() {
    const [price, setPrice] = useState(500);
    const [qty, setQty] = useState(120);
    const [method, setMethod] = useState<(typeof METHODS)[number]["key"]>("QRPH");

    const safePrice = Math.max(0, Number(price) || 0);
    const safeQty = Math.max(1, Math.floor(Number(qty) || 1));
    const revenue = safePrice * safeQty;
    const isFree = revenue === 0;

    // Platform take = 2% + ₱15/ticket — the exact production formula.
    const take = computePlatformTake({
        net: revenue,
        quantity: safeQty,
        pct: DEFAULT_PLATFORM_PCT,
        fixedFeePerTicket: DEFAULT_FIXED_FEE,
    });

    // Absorb: attendees pay face; you eat the take + processing.
    const procAbsorb = getProcessingFee(method, revenue);
    const absorbNet = Math.max(revenue - take - procAbsorb, 0);

    // Pass-on: attendees pay face + take; you only eat processing → keep full revenue.
    const procPass = getProcessingFee(method, revenue + take);
    const passNet = Math.max(revenue - procPass, 0);
    const passAttendeePerTicket = (revenue + take) / safeQty;

    // Savings vs a typical 10% platform (on the platform cut alone).
    const competitorTake = Math.round((revenue * COMPETITOR_PCT) / 100);
    const savings = Math.max(competitorTake - take, 0);

    // Composition bar for the "you absorb" scenario.
    const netPct = revenue > 0 ? (absorbNet / revenue) * 100 : 0;
    const takePct = revenue > 0 ? (take / revenue) * 100 : 0;
    const procPct = revenue > 0 ? (procAbsorb / revenue) * 100 : 0;

    return (
        <div className="rounded-3xl border border-border bg-background shadow-xl overflow-hidden max-w-4xl mx-auto">
            <div className="flex items-center gap-2 px-6 py-4 border-b bg-muted/30">
                <Calculator className="h-4 w-4 text-primary" />
                <p className="text-sm font-bold uppercase tracking-wider">See what you keep</p>
            </div>

            <div className="p-6 md:p-8 space-y-6">
                {/* Presets */}
                <div className="flex flex-wrap gap-2">
                    {PRESETS.map((p) => {
                        const active = safePrice === p.price && safeQty === p.qty;
                        return (
                            <button
                                key={p.label}
                                onClick={() => { setPrice(p.price); setQty(p.qty); }}
                                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                    active ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
                                }`}
                            >
                                {p.label}
                            </button>
                        );
                    })}
                </div>

                {/* Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-sm font-semibold flex items-center justify-between">
                            Ticket price
                            <span className="text-primary font-bold">{pesoShort(safePrice)}</span>
                        </label>
                        <input
                            type="range" min={0} max={5000} step={50}
                            value={safePrice}
                            onChange={(e) => setPrice(Number(e.target.value))}
                            className="w-full accent-[hsl(var(--primary))]"
                        />
                        <input
                            type="number" min={0}
                            value={price}
                            onChange={(e) => setPrice(Number(e.target.value))}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-semibold flex items-center justify-between">
                            Tickets sold
                            <span className="text-primary font-bold">{safeQty.toLocaleString()}</span>
                        </label>
                        <input
                            type="range" min={1} max={1000} step={1}
                            value={safeQty}
                            onChange={(e) => setQty(Number(e.target.value))}
                            className="w-full accent-[hsl(var(--primary))]"
                        />
                        <div className="flex items-center justify-between pt-1">
                            <span className="text-xs text-muted-foreground">Payment method</span>
                            <div className="flex gap-1">
                                {METHODS.map((m) => (
                                    <button
                                        key={m.key}
                                        onClick={() => setMethod(m.key)}
                                        title={m.hint}
                                        className={`rounded-md border px-2 py-1 text-xs font-bold transition-colors ${
                                            method === m.key ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
                                        }`}
                                    >
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {isFree ? (
                    <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
                        <p className="text-2xl font-headline font-black text-green-700">100% free</p>
                        <p className="text-sm text-green-700/80 mt-1">Free events cost nothing — no platform fee, no per-ticket fee.</p>
                    </div>
                ) : (
                    <>
                        {/* Composition bar (you-absorb scenario) */}
                        <div className="space-y-2">
                            <div className="flex h-4 w-full overflow-hidden rounded-full">
                                <div className="bg-primary" style={{ width: `${netPct}%` }} title={`You keep ${netPct.toFixed(1)}%`} />
                                <div className="bg-amber-400" style={{ width: `${takePct}%` }} title={`Platform fee ${takePct.toFixed(1)}%`} />
                                <div className="bg-muted-foreground/40" style={{ width: `${procPct}%` }} title={`Processing ${procPct.toFixed(1)}%`} />
                            </div>
                            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                                <Legend color="bg-primary" label={`You keep ${netPct.toFixed(1)}%`} />
                                <Legend color="bg-amber-400" label={`Platform ${takePct.toFixed(1)}%`} />
                                <Legend color="bg-muted-foreground/40" label={`Processing ${procPct.toFixed(1)}%`} />
                            </div>
                        </div>

                        {/* Side-by-side scenarios */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Scenario
                                title="You cover the fee"
                                subtitle="Attendees pay face value"
                                net={absorbNet}
                                attendeeLine={`Attendees pay ${peso(safePrice)}/ticket`}
                                lines={[
                                    { label: "Ticket sales", value: pesoShort(revenue) },
                                    { label: `Platform fee (${DEFAULT_PLATFORM_PCT}% + ₱${DEFAULT_FIXED_FEE})`, value: `– ${pesoShort(take)}` },
                                    { label: "Processing", value: `– ${peso(procAbsorb)}` },
                                ]}
                            />
                            <Scenario
                                highlight
                                title="Attendees cover the fee"
                                subtitle="You keep 100% of the ticket price"
                                net={passNet}
                                attendeeLine={`Attendees pay ${peso(passAttendeePerTicket)}/ticket`}
                                lines={[
                                    { label: "Ticket sales", value: pesoShort(revenue) },
                                    { label: "Platform fee", value: "Paid by attendees", muted: true },
                                    { label: "Processing", value: `– ${peso(procPass)}` },
                                ]}
                            />
                        </div>

                        {/* Savings vs competitor */}
                        {savings > 0 && (
                            <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                                <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                                    <TrendingUp className="h-5 w-5" />
                                </div>
                                <p className="text-sm">
                                    A typical <span className="font-semibold">{COMPETITOR_PCT}% platform</span> would take{" "}
                                    <span className="font-semibold">{pesoShort(competitorTake)}</span> — with HangHut you keep{" "}
                                    <span className="font-bold text-primary">{pesoShort(savings)} more</span>.
                                </p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

function Scenario({
    title, subtitle, net, attendeeLine, lines, highlight,
}: {
    title: string;
    subtitle: string;
    net: number;
    attendeeLine: string;
    lines: { label: string; value: string; muted?: boolean }[];
    highlight?: boolean;
}) {
    return (
        <div className={`rounded-2xl border p-5 ${highlight ? "border-primary bg-primary/[0.03]" : "border-border bg-muted/20"}`}>
            <div className="flex items-center gap-2">
                {highlight && <Check className="h-4 w-4 text-primary" />}
                <p className="font-bold text-sm">{title}</p>
            </div>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
            <p className="text-3xl font-headline font-black text-primary mt-3">{pesoShort(net)}</p>
            <p className="text-[11px] text-muted-foreground">your net payout</p>
            <div className="mt-4 space-y-1.5 border-t pt-3 text-xs">
                {lines.map((l) => (
                    <div key={l.label} className="flex items-center justify-between">
                        <span className="text-muted-foreground">{l.label}</span>
                        <span className={l.muted ? "text-muted-foreground" : "font-medium"}>{l.value}</span>
                    </div>
                ))}
                <p className="text-[11px] text-muted-foreground pt-1">{attendeeLine}</p>
            </div>
        </div>
    );
}

function Legend({ color, label }: { color: string; label: string }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
            {label}
        </span>
    );
}
