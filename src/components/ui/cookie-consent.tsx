"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Cookie, ShieldCheck, BarChart3, Sparkles, SlidersHorizontal } from "lucide-react";
import { CONSENT_KEY, LEGACY_KEY, CONSENT_EVENT, getCookieConsent, type CookieConsentValue } from "@/lib/consent";

// Re-export so existing imports from this module keep working.
export { getCookieConsent, type CookieConsentValue };

// Crumb particles for the little "nom" burst when a visitor accepts.
const CRUMBS = [
    { x: -26, y: -18, s: 6, d: 0 },
    { x: 22, y: -24, s: 5, d: 0.03 },
    { x: 30, y: 6, s: 7, d: 0.06 },
    { x: -30, y: 10, s: 5, d: 0.02 },
    { x: 4, y: -30, s: 4, d: 0.05 },
    { x: -10, y: 26, s: 6, d: 0.04 },
    { x: 18, y: 24, s: 4, d: 0.07 },
];

export function CookieConsent() {
    const [isVisible, setIsVisible] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [analytics, setAnalytics] = useState(true);
    const [marketing, setMarketing] = useState(true);
    const [celebrating, setCelebrating] = useState(false);

    useEffect(() => {
        if (getCookieConsent()) return; // already decided
        const timer = setTimeout(() => setIsVisible(true), 1500);
        return () => clearTimeout(timer);
    }, []);

    const persist = (a: boolean, m: boolean) => {
        const value: CookieConsentValue = {
            essential: true,
            analytics: a,
            marketing: m,
            ts: new Date().toISOString(),
        };
        try {
            localStorage.setItem(CONSENT_KEY, JSON.stringify(value));
            // Keep the legacy key in sync for anything still reading it.
            localStorage.setItem(LEGACY_KEY, a || m ? "accepted" : "declined");
            window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
        } catch {
            /* storage unavailable (private mode) — the banner still dismisses */
        }
    };

    // Save + dismiss. Celebrate with a crumb burst when anything beyond
    // essentials was accepted; otherwise just slip away.
    const finish = (a: boolean, m: boolean) => {
        persist(a, m);
        if (a || m) {
            setCelebrating(true);
            setTimeout(() => setIsVisible(false), 720);
        } else {
            setIsVisible(false);
        }
    };

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    role="dialog"
                    aria-label="Cookie consent"
                    aria-live="polite"
                    initial={{ y: 120, opacity: 0, scale: 0.96 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: 120, opacity: 0, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 320, damping: 26 }}
                    className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-6 z-50 sm:w-full sm:max-w-sm"
                >
                    {/* Soft brand glow behind the card */}
                    <div className="relative">
                        <div
                            aria-hidden
                            className="absolute -inset-px rounded-[28px] bg-gradient-to-br from-primary/40 via-primary/10 to-transparent blur-md opacity-70"
                        />
                        <div className="relative p-6 rounded-[28px] bg-background/85 backdrop-blur-xl border border-border/80 shadow-2xl flex flex-col gap-4 overflow-hidden">
                            {/* Header */}
                            <div className="flex items-start gap-4">
                                <div className="relative shrink-0">
                                    <motion.div
                                        // Idle wiggle to draw a friendly bit of attention.
                                        animate={celebrating ? { scale: [1, 1.15, 0.9, 1], rotate: 0 } : { rotate: [0, -9, 8, -5, 4, 0] }}
                                        transition={
                                            celebrating
                                                ? { duration: 0.5, ease: "easeOut" }
                                                : { duration: 1.3, repeat: Infinity, repeatDelay: 3.2, ease: "easeInOut" }
                                        }
                                        className="p-3 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-primary/20"
                                    >
                                        <Cookie className="w-6 h-6" />
                                    </motion.div>

                                    {/* Crumb burst on accept */}
                                    <AnimatePresence>
                                        {celebrating &&
                                            CRUMBS.map((c, i) => (
                                                <motion.span
                                                    key={i}
                                                    aria-hidden
                                                    initial={{ opacity: 1, scale: 0, x: 0, y: 0 }}
                                                    animate={{ opacity: 0, scale: 1, x: c.x, y: c.y }}
                                                    transition={{ duration: 0.6, delay: c.d, ease: "easeOut" }}
                                                    className="absolute left-1/2 top-1/2 rounded-full bg-primary/70"
                                                    style={{ width: c.s, height: c.s }}
                                                />
                                            ))}
                                    </AnimatePresence>
                                </div>

                                <div className="space-y-1.5">
                                    <h3 className="font-headline font-bold text-lg leading-tight">Care for a cookie?</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        We use cookies to keep HangHut running smoothly and remember your vibe. No creepy
                                        tracking — you&apos;re in control.{" "}
                                        <Link href="/privacy-policy" className="text-primary font-medium hover:underline underline-offset-2">
                                            Privacy Policy
                                        </Link>
                                    </p>
                                </div>
                            </div>

                            {/* Manage preferences — expandable */}
                            <AnimatePresence initial={false}>
                                {expanded && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.25, ease: "easeInOut" }}
                                        className="overflow-hidden"
                                    >
                                        <div className="flex flex-col gap-1 rounded-2xl bg-muted/40 border border-border/60 p-1.5">
                                            <PrefRow
                                                icon={<ShieldCheck className="w-4 h-4" />}
                                                title="Essential"
                                                desc="Login, security & core features"
                                                locked
                                                checked
                                            />
                                            <PrefRow
                                                icon={<BarChart3 className="w-4 h-4" />}
                                                title="Analytics"
                                                desc="Helps us improve HangHut"
                                                checked={analytics}
                                                onChange={setAnalytics}
                                            />
                                            <PrefRow
                                                icon={<Sparkles className="w-4 h-4" />}
                                                title="Marketing"
                                                desc="Events & offers you might like"
                                                checked={marketing}
                                                onChange={setMarketing}
                                            />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Actions */}
                            <div className="flex flex-col gap-2 pt-1">
                                <div className="flex gap-2 w-full">
                                    <Button variant="outline" onClick={() => finish(false, false)} className="flex-1 rounded-full">
                                        Essentials only
                                    </Button>
                                    {expanded ? (
                                        <Button onClick={() => finish(analytics, marketing)} className="flex-1 rounded-full shadow-glow">
                                            Save choices
                                        </Button>
                                    ) : (
                                        <Button onClick={() => finish(true, true)} className="flex-1 rounded-full shadow-glow">
                                            Accept all
                                        </Button>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setExpanded((v) => !v)}
                                    aria-expanded={expanded}
                                    className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <SlidersHorizontal className="w-3.5 h-3.5" />
                                    {expanded ? "Hide preferences" : "Manage preferences"}
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function PrefRow({
    icon,
    title,
    desc,
    checked,
    onChange,
    locked,
}: {
    icon: React.ReactNode;
    title: string;
    desc: string;
    checked: boolean;
    onChange?: (v: boolean) => void;
    locked?: boolean;
}) {
    return (
        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-background/60 transition-colors">
            <div className="text-primary/80 shrink-0">{icon}</div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold leading-none">{title}</p>
                    {locked && (
                        <span className="text-[10px] uppercase tracking-wide font-medium text-primary/70 bg-primary/10 rounded-full px-1.5 py-0.5">
                            Always on
                        </span>
                    )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">{desc}</p>
            </div>
            <Switch
                checked={checked}
                onCheckedChange={onChange}
                disabled={locked}
                aria-label={`${title} cookies`}
                className="shrink-0"
            />
        </div>
    );
}
