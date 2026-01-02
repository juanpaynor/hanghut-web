"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export function Cursor() {
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const mouseMove = (e: MouseEvent) => {
            setMousePosition({
                x: e.clientX,
                y: e.clientY
            });
        };

        window.addEventListener("mousemove", mouseMove);

        return () => {
            window.removeEventListener("mousemove", mouseMove);
        };
    }, []);

    return (
        <motion.div
            className="fixed top-0 left-0 w-8 h-8 rounded-full border border-foreground/30 pointer-events-none z-[9999] hidden md:block" // Hidden on mobile
            animate={{
                x: mousePosition.x - 16,
                y: mousePosition.y - 16,
            }}
            transition={{
                type: "spring",
                stiffness: 150,
                damping: 15,
                mass: 0.1
            }}
            style={{
                backdropFilter: "invert(10%)",
            }}
        />
    );
}
