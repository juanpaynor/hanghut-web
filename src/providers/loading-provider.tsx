'use client'

import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { usePathname, useSearchParams } from "next/navigation";

interface LoadingContextType {
    isLoading: boolean;
    setIsLoading: (isLoading: boolean) => void;
    showLoading: (message?: string) => void;
    hideLoading: () => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export function LoadingProvider({ children }: { children: ReactNode }) {
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState("Loading...");
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Reset loading state when path or search params change (navigation complete)
    useEffect(() => {
        setIsLoading(false);
        const timer = setTimeout(() => setMessage("Loading..."), 300);
        return () => clearTimeout(timer);
    }, [pathname, searchParams]);

    // Intercept clicks to trigger loading for internal links
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const target = (e.target as HTMLElement).closest('a');
            if (!target) return;

            const href = target.getAttribute('href');
            if (!href) return;

            // Ignore external links, downloads, new tabs, etc.
            if (
                target.target === '_blank' ||
                e.ctrlKey ||
                e.metaKey ||
                e.shiftKey ||
                e.altKey ||
                href.startsWith('http') ||
                href.startsWith('mailto:') ||
                href.startsWith('#') ||
                href === pathname // Don't reload same page
            ) {
                return;
            }

            // Trigger loading for valid internal navigation
            setIsLoading(true);
        };

        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [pathname]);

    const showLoading = (msg?: string) => {
        if (msg) setMessage(msg);
        setIsLoading(true);
    };

    const hideLoading = () => {
        setIsLoading(false);
        // Reset message after delay to allow exit animation
        setTimeout(() => setMessage("Loading..."), 300);
    };

    return (
        <LoadingContext.Provider value={{ isLoading, setIsLoading, showLoading, hideLoading }}>
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
