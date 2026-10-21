'use client'

import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { usePathname } from "next/navigation";

interface LoadingContextType {
    isLoading: boolean;
    setIsLoading: (isLoading: boolean) => void;
    showLoading: (message?: string) => void;
    hideLoading: () => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

const DEFAULT_MESSAGE = "Loading...";

/**
 * Nothing may hold the full-screen overlay longer than this.
 *
 * The click listener below guesses that a click is about to navigate. A guess
 * can be wrong, and when it was, the only thing that could clear the overlay
 * was a pathname change that never came — so the organizer was left looking at
 * a blurred page and a spinner with no way out but a manual reload.
 *
 * A real route change inside the dashboard resolves well under this, and slow
 * ones are already covered by the route's own loading.tsx. So the failsafe only
 * ever fires on a guess that was wrong, which is exactly when it is needed.
 */
const NAVIGATION_FAILSAFE_MS = 8000;

/**
 * An explicit showLoading() caller owns its own hideLoading() and is usually
 * waiting on a real request, so it gets a longer leash than the click guess
 * above — cutting a slow sign-in short on a PH mobile connection would be its
 * own bug. This is a last resort, not a timeout.
 */
const EXPLICIT_FAILSAFE_MS = 30000;

/**
 * Clicks that look like a link but do not navigate the current page.
 *
 * `download` is the one that caused the reported bug: every export in the
 * dashboard builds a temporary <a download href="blob:…"> and clicks it. The
 * old filter rejected hrefs starting with "http" — a blob URL starts with
 * "blob:", so it sailed through, raised the overlay, downloaded the file, and
 * then never navigated. "it downloads but the loading screen gets stuck."
 *
 * The scheme list matters for the same reason: mailto hands off to a mail
 * client, tel/sms to the dialer, javascript: runs in place. None of them are a
 * page load, and all of them used to raise an overlay that could not come down.
 */
function isNonNavigating(anchor: HTMLAnchorElement, href: string): boolean {
    if (anchor.hasAttribute('download')) return true;
    if (/^(blob:|data:|mailto:|tel:|sms:|javascript:)/i.test(href)) return true;
    // Every route under /api in this app is a route handler returning JSON or
    // a file — never a page. Linking straight to one downloads or redirects
    // without the page ever changing, so it must not raise the overlay even
    // when the author forgot the download attribute.
    return /^\/api\//.test(href);
}

export function LoadingProvider({ children }: { children: ReactNode }) {
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState(DEFAULT_MESSAGE);
    const pathname = usePathname();

    const failsafe = useRef<ReturnType<typeof setTimeout> | null>(null);
    const clearFailsafe = useCallback(() => {
        if (failsafe.current) {
            clearTimeout(failsafe.current);
            failsafe.current = null;
        }
    }, []);

    /** Raise the overlay with a deadline attached. Nothing raises it without
     *  one — that is what makes a stuck overlay impossible rather than rare. */
    const raise = useCallback((msg?: string, ttl: number = EXPLICIT_FAILSAFE_MS) => {
        if (msg) setMessage(msg);
        setIsLoading(true);
        clearFailsafe();
        failsafe.current = setTimeout(() => {
            failsafe.current = null;
            setIsLoading(false);
            setMessage(DEFAULT_MESSAGE);
        }, ttl);
    }, [clearFailsafe]);

    const lower = useCallback(() => {
        clearFailsafe();
        setIsLoading(false);
        // Reset the message after the exit animation, so the next overlay does
        // not flash the previous caller's text on its way in.
        setTimeout(() => setMessage(DEFAULT_MESSAGE), 300);
    }, [clearFailsafe]);

    // Navigation finished.
    useEffect(() => {
        clearFailsafe();
        setIsLoading(false);
        const timer = setTimeout(() => setMessage(DEFAULT_MESSAGE), 300);
        return () => clearTimeout(timer);
    }, [pathname, clearFailsafe]);

    useEffect(() => clearFailsafe, [clearFailsafe]);

    // Guess that a click on an internal link is about to navigate, and show the
    // overlay before React starts the transition.
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            // A handler already took this click, so no navigation follows.
            if (e.defaultPrevented) return;
            // Middle-click and modified clicks open a tab, leaving this one put.
            if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

            const anchor = (e.target as HTMLElement | null)?.closest?.('a');
            if (!anchor) return;

            const href = anchor.getAttribute('href');
            if (!href) return;

            if (anchor.target && anchor.target !== '_self') return;
            if (isNonNavigating(anchor, href)) return;

            // Resolve against the current page rather than string-matching the
            // scheme. A same-origin absolute URL is a normal navigation even
            // though it starts with "http", and an href with no scheme at all
            // can still point off-site ("//example.com").
            let url: URL;
            try {
                url = new URL(href, window.location.href);
            } catch {
                return;
            }
            if (url.origin !== window.location.origin) return;

            // Same pathname — including links that only rewrite the query
            // string, like the ticket preview's ?template= switcher.
            //
            // Those ARE navigations, but usePathname does not change for them,
            // so the effect below would never take the overlay down and only
            // the failsafe would — eight seconds of blurred screen for a change
            // that lands in a few hundred milliseconds. Better to show nothing
            // than to show something that cannot be dismissed on completion.
            if (url.pathname === window.location.pathname) return;

            raise(undefined, NAVIGATION_FAILSAFE_MS);
        };

        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [raise]);

    return (
        <LoadingContext.Provider
            value={{
                isLoading,
                // Routed through the same pair, so a caller reaching for the raw
                // setter still gets the deadline. The overlay covers the whole
                // screen; nothing should be able to raise it without one.
                setIsLoading: (v: boolean) => (v ? raise() : lower()),
                showLoading: (msg?: string) => raise(msg),
                hideLoading: lower,
            }}
        >
            {children}
            <LoadingOverlay isLoading={isLoading} message={message} />
        </LoadingContext.Provider>
    );
}

export function useLoading() {
    const context = useContext(LoadingContext);
    if (context === undefined) {
        throw new Error("useLoading must be used within a LoadingProvider");
    }
    return context;
}
