"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown } from "lucide-react";

export interface FaqItem {
    q: string;
    a: string;
}

/** Reusable FAQ accordion, shared by the Become-a-Partner and Pricing pages. */
export function FaqAccordion({ faqs }: { faqs: FaqItem[] }) {
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    return (
        <div className="space-y-3">
            {faqs.map((faq, i) => (
                <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-2xl border border-border overflow-hidden"
                >
                    <button
                        onClick={() => setOpenFaq(openFaq === i ? null : i)}
                        className="w-full flex items-center justify-between p-6 text-left hover:bg-muted/30 transition-colors"
                    >
                        <span className="font-semibold text-base pr-4">{faq.q}</span>
                        <ChevronDown
                            className={`h-5 w-5 text-muted-foreground shrink-0 transition-transform duration-200 ${openFaq === i ? "rotate-180" : ""}`}
                        />
                    </button>
                    <AnimatePresence initial={false}>
                        {openFaq === i && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <div className="px-6 pb-6 text-muted-foreground leading-relaxed border-t pt-4">
                                    {faq.a}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            ))}
        </div>
    );
}
