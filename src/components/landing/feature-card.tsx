"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FeatureCardProps {
    title: string;
    description: string;
    icon: ReactNode;
    color: string;
    index: number;
    children?: ReactNode;
}

export function FeatureCard({ title, description, icon, color, index, children }: FeatureCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, delay: index * 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="w-full"
        >
            <Card className={`group relative overflow-hidden h-full p-8 md:p-12 rounded-[40px] border-0 shadow-lg hover:shadow-2xl transition-all duration-500 ${color} backdrop-blur-sm bg-opacity-70`}>
                <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center">
                    <div className="flex-1 space-y-6">
                        <CardHeader className="p-0 space-y-4">
                            <div className="p-4 w-fit rounded-2xl bg-white shadow-sm group-hover:scale-110 transition-transform duration-500">
                                {icon}
                            </div>
                            <CardTitle className="text-4xl md:text-5xl font-headline font-bold leading-tight">
                                {title}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed font-light">
                                {description}
                            </p>
                        </CardContent>
                    </div>
                    {children && (
                        <div className="flex-1 w-full max-w-sm">
                            {children}
                        </div>
                    )}
                </div>

                {/* Decorative element */}
                <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-primary opacity-5 rounded-full blur-3xl group-hover:opacity-10 transition-opacity" />
            </Card>
        </motion.div>
    );
}
