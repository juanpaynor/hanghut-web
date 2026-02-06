"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, MotionValue } from "framer-motion";
import { Users, MapPin } from "lucide-react";

interface FloatingItem {
    id: number;
    type: "avatar" | "chat" | "pin";
    initialX: number;
    initialY: number;
    color: string;
    text?: string;
    delay: number;
}

const ITEMS: FloatingItem[] = [
    { id: 1, type: "avatar", initialX: -120, initialY: -100, color: "bg-blue-500", delay: 0 },
    { id: 2, type: "chat", initialX: 140, initialY: -80, color: "bg-indigo-100", text: "Anyone in Tokyo?", delay: 0.1 },
    { id: 3, type: "avatar", initialX: -100, initialY: 120, color: "bg-purple-500", delay: 0.2 },
    { id: 4, type: "chat", initialX: 100, initialY: 100, color: "bg-pink-100", text: "Let's go! 🚀", delay: 0.15 },
    { id: 5, type: "pin", initialX: 0, initialY: -140, color: "text-red-500", delay: 0.05 },
    { id: 6, type: "avatar", initialX: 130, initialY: 40, color: "bg-green-500", delay: 0.25 },
];

export default function SocialVortex({ isFullScreen = false }: { isFullScreen?: boolean }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start end", "center center"]
    });

    // Adjust scale factors based on mode
    const baseRadius = isFullScreen ? 2.5 : 1.5;
    const itemScale = isFullScreen ? 1.5 : 1;

    // Transform scroll progress (0 to 1) into physics values
    // As we scroll down (0 -> 1), radius shrinks and rotation increases
    const radiusMultiplier = useTransform(scrollYProgress, [0, 1], [baseRadius, 0]);
    const rotation = useTransform(scrollYProgress, [0, 1], [0, 360 * 2]); // Spin 2 times
    const centerScale = useTransform(scrollYProgress, [0.8, 1], [0.5, isFullScreen ? 2 : 1.2]); // Pop at the end
    const opacity = useTransform(scrollYProgress, [0.2, 0.8], [0, 1]);

    return (
        <div ref={containerRef} className={`relative w-full ${isFullScreen ? 'h-full' : 'h-[300px]'} flex items-center justify-center overflow-hidden ${isFullScreen ? '' : 'bg-white/50 backdrop-blur-sm rounded-[30px] border border-blue-100/50'}`}>

            {/* Center "Group Chat" Hub */}
            <motion.div
                style={{ scale: centerScale }}
                className="relative z-20 flex flex-col items-center justify-center p-6 bg-white rounded-3xl shadow-2xl border border-indigo-100"
            >
                <div className="flex -space-x-3 mb-2">
                    <div className="h-8 w-8 rounded-full bg-blue-500 border-2 border-white ring-2 ring-blue-100" />
                    <div className="h-8 w-8 rounded-full bg-purple-500 border-2 border-white ring-2 ring-purple-100" />
                    <div className="h-8 w-8 rounded-full bg-pink-500 border-2 border-white ring-2 ring-pink-100" />
                </div>
                <div className="text-xs font-bold text-indigo-900 uppercase tracking-widest">
                    Tokyo Crew
                </div>
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white animate-pulse" />
            </motion.div>

            {/* Swirling Items */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {ITEMS.map((item) => (
                    <SwirlingItem
                        key={item.id}
                        item={{ ...item, initialX: item.initialX * (isFullScreen ? 2.5 : 1), initialY: item.initialY * (isFullScreen ? 2.5 : 1) }}
                        radiusMultiplier={radiusMultiplier}
                        rotation={rotation}
                        scaleMultiplier={itemScale}
                    />
                ))}
            </div>

            {/* Background Grid */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:20px_20px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />
        </div>
    );
}

function SwirlingItem({ item, radiusMultiplier, rotation, scaleMultiplier = 1 }: {
    item: FloatingItem,
    radiusMultiplier: MotionValue<number>,
    rotation: MotionValue<number>,
    scaleMultiplier?: number
}) {
    // Calculate orbital position based on rotation
    // We treat initialX/Y as the "angle" on the circle
    const angleOffset = Math.atan2(item.initialY, item.initialX) * (180 / Math.PI);
    const distance = Math.sqrt(item.initialX ** 2 + item.initialY ** 2);

    const currentAngle = useTransform(rotation, r => r + angleOffset);
    const currentRadius = useTransform(radiusMultiplier, m => distance * m);

    // Polar to Cartesian conversion for actual x/y transform
    const x = useTransform([currentAngle, currentRadius], ([a, r]: number[]) => Math.cos(a * (Math.PI / 180)) * r);
    const y = useTransform([currentAngle, currentRadius], ([a, r]: number[]) => Math.sin(a * (Math.PI / 180)) * r);
    const scale = useTransform(radiusMultiplier, [1.5, 0.2], [0.8 * scaleMultiplier, 1 * scaleMultiplier]);
    const opacity = useTransform(radiusMultiplier, [1.5, 1.2], [0, 1]);

    return (
        <motion.div
            style={{ x, y, scale, opacity }}
            className="absolute"
        >
            {item.type === 'avatar' && (
                <div className={`h-10 w-10 rounded-full ${item.color} border-2 border-white shadow-lg`} />
            )}
            {item.type === 'chat' && (
                <div className={`${item.color} px-3 py-2 rounded-2xl rounded-bl-none text-[10px] font-bold shadow-md whitespace-nowrap`}>
                    {item.text}
                </div>
            )}
            {item.type === 'pin' && (
                <MapPin className={`h-8 w-8 ${item.color} drop-shadow-md`} />
            )}
        </motion.div>
    );
}
