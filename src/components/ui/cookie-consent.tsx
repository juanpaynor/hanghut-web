"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Cookie } from "lucide-react";

export function CookieConsent() {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Check if user has already made a choice
        const consent = localStorage.getItem("hanghut-cookie-consent");
        if (!consent) {
            // Small delay so it doesn't smack them immediately on load
            const timer = setTimeout(() => setIsVisible(true), 1500);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleAccept = () => {
        localStorage.setItem("hanghut-cookie-consent", "accepted");
        setIsVisible(false);
    };

    const handleDecline = () => {
        localStorage.setItem("hanghut-cookie-consent", "declined");
        setIsVisible(false);
    };

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="fixed bottom-4 right-4 z-50 w-full max-w-sm"
                >
                    <div className="mx-4 md:mx-0 p-6 rounded-3xl bg-background/80 backdrop-blur-xl border border-border shadow-2xl flex flex-col gap-4">
                        <div className="flex items-start gap-4">
                            <div className="p-3 rounded-full bg-primary/10 text-primary">
                                <Cookie className="w-6 h-6" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-headline font-bold text-lg">Quick Cookie Check 🍪</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    We use cookies to make your experience smoother. No creepy tracking, just the essentials to keep things running perfectly.
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-2 w-full pt-2">
                            <Button
                                variant="outline"
                                onClick={handleDecline}
                                className="flex-1 rounded-full"
                            >
                                No thanks
                            </Button>
                            <Button
                                onClick={handleAccept}
                                className="flex-1 rounded-full shadow-glow"
                            >
                                Sounds good
                            </Button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
