"use client";

import { useEffect, useRef } from 'react';
import Matter from 'matter-js';

export default function PhysicsEcosystem() {
    const sceneRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<Matter.Engine | null>(null);

    useEffect(() => {
        if (!sceneRef.current) return;

        const Engine = Matter.Engine,
            Render = Matter.Render,
            Runner = Matter.Runner,
            Composite = Matter.Composite,
            Bodies = Matter.Bodies,
            Common = Matter.Common;

        const engine = Engine.create();
        engineRef.current = engine;
        const world = engine.world;

        const render = Render.create({
            element: sceneRef.current,
            engine: engine,
            options: {
                width: sceneRef.current.clientWidth,
                height: sceneRef.current.clientHeight,
                background: 'transparent',
                wireframes: false,
                pixelRatio: window.devicePixelRatio
            }
        });

        const wallThickness = 100;
        const width = sceneRef.current.clientWidth;
        const height = sceneRef.current.clientHeight;

        const walls = [
            Bodies.rectangle(width / 2, height + wallThickness / 2, width, wallThickness, { isStatic: true, render: { visible: false } }),
            Bodies.rectangle(-wallThickness / 2, height / 2, wallThickness, height * 10, { isStatic: true, render: { visible: false } }),
            Bodies.rectangle(width + wallThickness / 2, height / 2, wallThickness, height * 10, { isStatic: true, render: { visible: false } })
        ];
        Composite.add(world, walls);

        const stickers = [
            { text: "🎫", color: "#e0e7ff" },
            { text: "📍", color: "#fce7f3" },
            { text: "✨", color: "#ccfbf1" },
            { text: "🤝", color: "#ffedd5" },
            { text: "🔥", color: "#fef3c7" },
            { text: "🌍", color: "#dbeafe" }
        ];

        const createStickerTexture = (emoji: string, color: string) => {
            const canvas = document.createElement('canvas');
            const size = 64;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx) return '';

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.roundRect(0, 0, size, size, 12);
            ctx.fill();

            ctx.font = '32px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(emoji, size / 2, size / 2 + 2);

            return canvas.toDataURL();
        };

        const addSticker = () => {
            if (!engineRef.current) return;
            const x = Math.random() * width;
            const sticker = Common.choose(stickers);
            const textureURL = createStickerTexture(sticker.text, sticker.color);

            const body = Bodies.rectangle(x, -50, 48, 48, {
                chamfer: { radius: 12 },
                restitution: 0.6,
                friction: 0.1,
                angle: Math.random() * Math.PI,
                render: {
                    sprite: {
                        texture: textureURL,
                        xScale: 0.75,
                        yScale: 0.75
                    }
                }
            });

            Composite.add(world, body);

            // Limit bodies to keep performance high
            if (world.bodies.length > 30) {
                Composite.remove(world, world.bodies[3]); // Keep walls [0,1,2]
            }
        };

        const interval = setInterval(addSticker, 3000);

        Render.run(render);
        const runner = Runner.create();
        Runner.run(runner, engine);

        const handleResize = () => {
            if (!render.canvas) return;
            render.canvas.width = window.innerWidth;
            Matter.Body.setPosition(walls[0], { x: window.innerWidth / 2, y: height + 50 });
            Matter.Body.setPosition(walls[2], { x: window.innerWidth + 50, y: height / 2 });
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            clearInterval(interval);
            Render.stop(render);
            Runner.stop(runner);
            if (render.canvas) render.canvas.remove();
            Composite.clear(world, false);
            Engine.clear(engine);
        };
    }, []);

    return <div ref={sceneRef} className="absolute inset-0 z-0 opacity-40 pointer-events-none" />;
}
