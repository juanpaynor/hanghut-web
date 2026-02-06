"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ReactNode, useRef } from "react";
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
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const mouseX = useSpring(x, { stiffness: 500, damping: 100 });
    const mouseY = useSpring(y, { stiffness: 500, damping: 100 });

    function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
        const { left, top, width, height } = currentTarget.getBoundingClientRect();
        x.set(clientX - left - width / 2);
        y.set(clientY - top - height / 2);
    }

    function handleMouseLeave() {
        x.set(0);
        y.set(0);
    }

    const rotateX = useTransform(mouseY, [-300, 300], [5, -5]);
    const rotateY = useTransform(mouseX, [-300, 300], [-5, 5]);

    return (
        <motion.div
            initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, delay: index * 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="w-full perspective-1000"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            <motion.div
                style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
            >
                <Card className={`group relative overflow-hidden h-full p-8 md:p-12 rounded-[40px] border border-white/20 shadow-xl hover:shadow-2xl transition-all duration-500 ${color} backdrop-blur-xl bg-opacity-60`}>

                    {/* Inner Shine Effect */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                    <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center transform-style-3d">
                        <div className="flex-1 space-y-6">
                            <CardHeader className="p-0 space-y-4">
                                <div className="p-4 w-fit rounded-2xl bg-white/40 shadow-inner group-hover:scale-110 transition-transform duration-500 border border-white/20 backdrop-blur-md">
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
        </motion.div>
    );
}
