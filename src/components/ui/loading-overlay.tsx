"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

interface LoadingOverlayProps {
    isLoading: boolean;
    message?: string;
}

const LOGO_SRC = "/loading_image/logo_animated.gif";

/**
 * Whether the GIF has finished downloading at least once this session.
 *
 * Module scope, not component state, on purpose: the overlay is unmounted by
 * AnimatePresence every time it closes, so component state would reset to
 * "not loaded" on the next navigation and flash the fallback ring even though
 * the browser serves the file instantly from cache.
 */
let logoReady = false;

export function LoadingOverlay({ isLoading, message = "Loading..." }: LoadingOverlayProps) {
    const reduceMotion = useReducedMotion();
    const [ready, setReady] = React.useState(logoReady);

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
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="flex flex-col items-center gap-6"
                    >
                        {/* 176px. The source is 500x500, so this still renders
                            below 1:1 on a 2x display (352 < 500) and stays
                            crisp — about 250px is where it would start to
                            soften. */}
                        <div className="relative flex h-44 w-44 items-center justify-center">
                            {/*
                             * The ring is not decoration, it is the fallback. The GIF is
                             * 406 KB, and the first time anyone navigates it has not been
                             * downloaded yet — on a PH mobile connection that is seconds of
                             * a completely blank overlay. So the ring holds the space until
                             * the GIF reports it is ready, and is also what reduced-motion
                             * users get instead of a 150-frame running figure.
                             */}
                            {(!ready || reduceMotion) && (
                                <>
                                    <span className="absolute inline-flex h-36 w-36 animate-ping rounded-full bg-primary/20 duration-1000" />
                                    <span className="relative h-24 w-24 rounded-full bg-primary shadow-xl shadow-primary/30" />
                                </>
                            )}

                            {!reduceMotion && (
                                // A plain <img>, not next/image: Next's optimiser re-encodes
                                // and would serve a single still frame unless `unoptimized`
                                // is set, at which point next/image is only adding markup.
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={LOGO_SRC}
                                    alt=""
                                    width={176}
                                    height={176}
                                    // Decorative: `message` below already says what is
                                    // happening, so announcing it twice helps nobody.
                                    aria-hidden="true"
                                    onLoad={() => { logoReady = true; setReady(true); }}
                                    className={`absolute h-44 w-44 object-contain transition-opacity duration-200 ${
                                        ready ? "opacity-100" : "opacity-0"
                                    }`}
                                />
                            )}
                        </div>

                        <h3 className="text-lg font-medium text-foreground tracking-tight animate-pulse">
                            {message}
                        </h3>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
