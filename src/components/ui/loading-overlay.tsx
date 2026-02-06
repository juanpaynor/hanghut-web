"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";

interface LoadingOverlayProps {
    isLoading: boolean;
    message?: string;
}

export function LoadingOverlay({ isLoading, message = "Loading..." }: LoadingOverlayProps) {
    return (
        <AnimatePresence>
            {isLoading && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/60 backdrop-blur-md"
                >
                    {/* Logo / Spinner Container */}
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="flex flex-col items-center gap-6"
                    >
                        {/* Pulsing Circle Effect */}
                        <div className="relative flex items-center justify-center">
                            <span className="absolute inline-flex h-24 w-24 animate-ping rounded-full bg-primary/20 duration-1000" />
                            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary shadow-xl shadow-primary/30">
                                {/* Simple SVG Logo or Icon */}
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="h-8 w-8 text-white animate-pulse"
                                >
                                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                                </svg>
                            </div>
                        </div>

                        {/* Loading Text */}
                        <h3 className="text-lg font-medium text-foreground tracking-tight animate-pulse">
                            {message}
                        </h3>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
