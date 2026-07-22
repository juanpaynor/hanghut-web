"use client";

import { useState } from "react";
import { computePlatformTake, DEFAULT_PLATFORM_PCT, DEFAULT_FIXED_FEE } from "@/lib/payment/platform-fees";
import { getProcessingFee } from "@/lib/payment/processing-fees";
import { Switch } from "@/components/ui/switch";
import { Calculator } from "lucide-react";

const METHODS = [
    { key: "QRPH", label: "QR Ph", hint: "1.4%" },
    { key: "GCASH", label: "GCash", hint: "2.3%" },
    { key: "CARDS", label: "Card", hint: "3.2% + ₱10" },
] as const;

const peso = (n: number) =>
    `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Interactive "what will I keep?" calculator for the Become-a-Partner page.
 * Uses the SAME formula as checkout/create-purchase-intent (platform-fees.ts +
 * processing-fees.ts) so the numbers match reality, and demonstrates the
 * pass-fees-to-attendees toggle.
 */
export function PartnerFeeCalculator() {
    const [price, setPrice] = useState(500);
    const [qty, setQty] = useState(50);
    const [method, setMethod] = useState<(typeof METHODS)[number]["key"]>("QRPH");
    const [passOn, setPassOn] = useState(false);

    const safePrice = Math.max(0, Number(price) || 0);
    const safeQty = Math.max(1, Math.floor(Number(qty) || 1));
    const revenue = safePrice * safeQty;

    // Platform take = 2% + ₱15/ticket — the exact production formula.
    const platformTake = computePlatformTake({
        net: revenue,
        quantity: safeQty,
        pct: DEFAULT_PLATFORM_PCT,
        fixedFeePerTicket: DEFAULT_FIXED_FEE,
    });

    // Attendees pay the take on top only when it's passed on.
    const attendeesPayTotal = passOn ? revenue + platformTake : revenue;
    const processing = getProcessingFee(method, attendeesPayTotal);

    // You absorb processing either way. In pass-on mode the take is funded by the
    // attendee, so you keep the full ticket revenue (minus processing).
    const youKeep = passOn ? revenue - processing : revenue - platformTake - processing;
    const attendeePerTicket = attendeesPayTotal / safeQty;
    const keepPct = revenue > 0 ? (youKeep / revenue) * 100 : 0;

    return (
        <div className="rounded-3xl border border-border bg-background shadow-xl overflow-hidden max-w-4xl mx-auto">
            <div className="flex items-center gap-2 px-6 py-4 border-b bg-muted/30">
                <Calculator className="h-4 w-4 text-primary" />
                <p className="text-sm font-bold uppercase tracking-wider">See what you keep</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2">
                {/* Inputs */}
                <div className="p-6 md:p-8 space-y-6 border-b md:border-b-0 md:border-r border-border">
                    <div className="space-y-2">
                        <label className="text-sm font-semibold flex items-center justify-between">
                            Ticket price
                            <span className="text-primary font-bold">{peso(safePrice)}</span>
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
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold">Payment method</label>
                        <div className="grid grid-cols-3 gap-2">
                            {METHODS.map((m) => (
                                <button
                                    key={m.key}
                                    onClick={() => setMethod(m.key)}
                                    className={`rounded-lg border px-2 py-2 text-center transition-colors ${
                                        method === m.key
                                            ? "border-primary bg-primary/10 text-primary"
                                            : "border-border hover:border-primary/40"
                                    }`}
                                >
                                    <span className="block text-xs font-bold">{m.label}</span>
                                    <span className="block text-[10px] text-muted-foreground">{m.hint}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-3 cursor-pointer">
                        <div>
                            <p className="text-sm font-semibold">Pass fee to attendees</p>
                            <p className="text-xs text-muted-foreground">Keep 100% of the ticket price</p>
                        </div>
                        <Switch checked={passOn} onCheckedChange={setPassOn} className="shrink-0" />
                    </label>
                </div>

                {/* Results */}
                <div className="p-6 md:p-8 bg-muted/20 flex flex-col justify-center space-y-5">
                    <div className="text-center">
                        <p className="text-sm text-muted-foreground">You keep</p>
                        <p className="text-5xl font-headline font-black text-primary">{peso(youKeep)}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {keepPct.toFixed(1)}% of your ₱{revenue.toLocaleString()} in sales
                        </p>
                    </div>

                    <div className="space-y-2 text-sm border-t pt-4">
                        <Line label={`Ticket sales (${safeQty}×${peso(safePrice)})`} value={peso(revenue)} />
                        <Line
                            label={`Platform fee (${DEFAULT_PLATFORM_PCT}% + ₱${DEFAULT_FIXED_FEE}/ticket)`}
                            value={passOn ? "Paid by attendees" : `– ${peso(platformTake)}`}
                            muted={passOn}
                        />
                        <Line label="Processing fee (absorbed by you)" value={`– ${peso(processing)}`} />
                        <div className="border-t pt-2 flex items-center justify-between font-bold">
                            <span>Your net payout</span>
                            <span className="text-primary">{peso(youKeep)}</span>
                        </div>
                    </div>

                    <p className="text-center text-xs text-muted-foreground">
                        Attendees pay <span className="font-semibold text-foreground">{peso(attendeePerTicket)}</span> per ticket
                    </p>
                </div>
            </div>
        </div>
    );
}

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{label}</span>
            <span className={muted ? "text-muted-foreground" : "font-medium"}>{value}</span>
        </div>
    );
}
