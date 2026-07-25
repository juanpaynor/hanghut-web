"use client";

import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/next";
import { analyticsAllowed, CONSENT_EVENT } from "@/lib/consent";

/**
 * Mounts Vercel Analytics only when the visitor allows analytics cookies.
 * Renders nothing on the server / before the choice is read, and re-checks
 * whenever the cookie banner fires the consent event so toggling takes effect
 * without a reload.
 */
export function ConsentedAnalytics() {
    const [allowed, setAllowed] = useState(false);

    useEffect(() => {
        const check = () => setAllowed(analyticsAllowed());
        check();
        window.addEventListener(CONSENT_EVENT, check);
        return () => window.removeEventListener(CONSENT_EVENT, check);
    }, []);

    return allowed ? <Analytics /> : null;
}
