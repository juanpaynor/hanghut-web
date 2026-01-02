"use client";

import { useEffect, useRef } from 'react';
import Matter from 'matter-js';

export default function PhysicsActivities() {
    const sceneRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<Matter.Engine | null>(null);

    useEffect(() => {
        if (!sceneRef.current) return;

        // Module aliases
        const Engine = Matter.Engine,
            Render = Matter.Render,
            Runner = Matter.Runner,
            Composite = Matter.Composite,
            Bodies = Matter.Bodies,
            Mouse = Matter.Mouse,
            MouseConstraint = Matter.MouseConstraint,
            Common = Matter.Common;

        // Create engine
        const engine = Engine.create();
        engineRef.current = engine;
        const world = engine.world;

        // Create renderer
        const render = Render.create({
            element: sceneRef.current,
            engine: engine,
            options: {
                width: window.innerWidth,
                height: window.innerHeight,
                background: 'transparent',
                wireframes: false,
                pixelRatio: window.devicePixelRatio
            }
        });

        // Add borders (walls)
        const wallThickness = 100;
        const width = window.innerWidth;
        const height = window.innerHeight;

        const walls = [
            Bodies.rectangle(width / 2, height + wallThickness / 2, width, wallThickness, { isStatic: true, render: { visible: false } }),
            Bodies.rectangle(-wallThickness / 2, height / 2, wallThickness, height * 10, { isStatic: true, render: { visible: false } }),
            Bodies.rectangle(width + wallThickness / 2, height / 2, wallThickness, height * 10, { isStatic: true, render: { visible: false } })
        ];
        Composite.add(world, walls);

        // --- Texture Generation ---

        // Create texture with Text AND Emoji
        const createCardTexture = (text: string, emoji: string, color: string) => {
            const canvas = document.createElement('canvas');
            const w = 340;
            const h = 80;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) return '';

            // Background
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, w, h); // Draw full background (body shape chops it if chamfered, but better to just fill)

            // Emoji (Left)
            ctx.font = '40px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(emoji, 40, h / 2 + 2);

            // Text (Right)
            ctx.fillStyle = '#1e1b4b'; // Dark indigo text
            ctx.font = 'bold 18px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(text, 80, h / 2);

            return canvas.toDataURL();
        };

        const requests = [
            { text: "John wants to get Coffee", emoji: "☕️" },
            { text: "Sarah wants to go hiking", emoji: "⛰️" },
            { text: "Amanda wants a movie night", emoji: "🍿" },
            { text: "Mike is looking for gym bro", emoji: "🏋️" },
            { text: "Alex wants to play Catan", emoji: "🎲" },
            { text: "Jess is craving Sushi", emoji: "🍣" },
            { text: "Tom wants to jam", emoji: "🎸" },
            { text: "Emily needs a hiking crew", emoji: "🥾" },
            { text: "David wants to code", emoji: "💻" },
            { text: "Sophie wants to try pottery", emoji: "🏺" },
            { text: "Chris is going for a run", emoji: "🏃" },
            { text: "New hangout nearby", emoji: "📍" },
            { text: "Lisa wants to grab drinks", emoji: "🍹" }
        ];

        const colors = ['#e0e7ff', '#fce7f3', '#ccfbf1', '#ffedd5', '#fef3c7', '#dbeafe'];

        const addBody = () => {
            if (!engineRef.current) return;

            const x = Math.random() * width;
            const y = -100 - Math.random() * 500;

            const req = Common.choose(requests);
            const color = Common.choose(colors);
            const textureURL = createCardTexture(req.text, req.emoji, color);


            // Dimensions
            const w = 340;
            const h = 80;
            const scale = 0.75; // Scale down slightly for mobile/desktop fitting

            const body = Bodies.rectangle(x, y, w * scale, h * scale, {
                chamfer: { radius: 30 }, // Fully rounded capsule look
                restitution: 0.5,
                angle: (Math.random() - 0.5) * 0.4,
                render: {
                    sprite: {
                        texture: textureURL,
                        xScale: scale,
                        yScale: scale
                    }
                }
            });

            Composite.add(world, body);
        };

        // Add initial bodies
        for (let i = 0; i < 15; i++) {
            setTimeout(addBody, i * 150);
        }

        const interval = setInterval(addBody, 1200);

        // Add mouse control
        const mouse = Mouse.create(render.canvas);
        const mouseConstraint = MouseConstraint.create(engine, {
            mouse: mouse,
            constraint: {
                stiffness: 0.2,
                render: { visible: false }
            }
        });
        Composite.add(world, mouseConstraint);

        // Pass events to scroll
        mouse.element.removeEventListener("mousewheel", (mouse as any).mousewheel);
        mouse.element.removeEventListener("DOMMouseScroll", (mouse as any).mousewheel);

        // Run
        Render.run(render);
        const runner = Runner.create();
        Runner.run(runner, engine);

        // Resize
        const handleResize = () => {
            render.canvas.width = window.innerWidth;
            render.canvas.height = window.innerHeight;
            Matter.Body.setPosition(walls[0], { x: window.innerWidth / 2, y: window.innerHeight + 50 });
            Matter.Body.setPosition(walls[2], { x: window.innerWidth + 50, y: window.innerHeight / 2 });
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

    return <div ref={sceneRef} className="absolute inset-0 pointer-events-auto" />;
}
