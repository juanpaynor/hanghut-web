/**
 * Cookie-consent source of truth. Dependency-free so any client module (analytics,
 * marketing, scripts) can gate off it without importing the banner component.
 * The <CookieConsent> banner writes here; readers call getCookieConsent() or the
 * category helpers below, and can listen for the "hanghut-cookie-consent" window
 * event to react when the visitor changes their choice.
 */

export const CONSENT_KEY = "hanghut-cookie-consent-v2";
export const LEGACY_KEY = "hanghut-cookie-consent";
export const CONSENT_EVENT = "hanghut-cookie-consent";

export type CookieConsentValue = {
    essential: true;
    analytics: boolean;
    marketing: boolean;
    ts: string;
};

/**
 * Read the visitor's stored choice, or null if undecided. Backwards compatible
 * with the old "accepted"/"declined" string key so returning visitors keep
 * their decision and are never re-prompted.
 */
export function getCookieConsent(): CookieConsentValue | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(CONSENT_KEY);
        if (raw) return JSON.parse(raw) as CookieConsentValue;
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy === "accepted") return { essential: true, analytics: true, marketing: true, ts: "" };
        if (legacy === "declined") return { essential: true, analytics: false, marketing: false, ts: "" };
    } catch {
        /* malformed / unavailable storage — treat as undecided */
    }
    return null;
}

// Non-essential categories use an opt-OUT stance: allowed until the visitor
// explicitly turns them off (undecided => allowed). This keeps first-party,
// cookieless analytics flowing while still honoring an explicit "no". To switch
// to strict opt-IN (block until the visitor accepts), change `!== false` to
// `=== true` in both helpers below.
export function analyticsAllowed(): boolean {
    const c = getCookieConsent();
    return c ? c.analytics !== false : true;
}

export function marketingAllowed(): boolean {
    const c = getCookieConsent();
    return c ? c.marketing !== false : true;
}
