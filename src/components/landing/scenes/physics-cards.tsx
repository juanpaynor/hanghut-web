"use client";

import Matter from "matter-js";
import { useEffect, useRef } from "react";

/* ─────────────────────────────────────────────────────────────────────────
   The draggable layer: real hangout requests falling into the hero and piling
   up at its floor. Kept from the previous landing because it is the one thing
   on the page a visitor can play with — thinned out, since it now sits in
   front of the light field rather than being the whole hero.

   The cards are drawn against the page, so their fill has to follow it: on
   white they are near-white with a hairline and a tinted emoji disc, which is
   the same card the app uses, not a second visual language.

   Desktop only. On a phone there is no cursor to drag with, the pile eats the
   headline, and a physics solver is the last thing a mid-range device needs
   while it is still fetching the video below.
   ───────────────────────────────────────────────────────────────────────── */

const REQUESTS = [
    { text: "John wants to get coffee", emoji: "☕️" },
    { text: "Sarah wants to go hiking", emoji: "⛰️" },
    { text: "Amanda wants a movie night", emoji: "🍿" },
    { text: "Mike is looking for a gym bro", emoji: "🏋️" },
    { text: "Alex wants to play Catan", emoji: "🎲" },
    { text: "Jess is craving sushi", emoji: "🍣" },
    { text: "Tom wants to jam", emoji: "🎸" },
    { text: "Emily needs a hiking crew", emoji: "🥾" },
    { text: "Sophie wants to try pottery", emoji: "🏺" },
    { text: "Chris is going for a run", emoji: "🏃" },
    { text: "Lisa wants to grab drinks", emoji: "🍹" },
];

const CARD_W = 340;
const CARD_H = 82;
const RADIUS = 41;

export default function PhysicsCards() {
    const sceneRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const host = sceneRef.current;
        if (!host) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        if (window.innerWidth < 1024) return;

        const {
            Engine, Render, Runner, Composite, Bodies, Mouse, MouseConstraint, Common,
        } = Matter;

        const engine = Engine.create({ enableSleeping: true });
        const world = engine.world;
        engine.gravity.y = 0.75;

        let width = window.innerWidth;
        let height = window.innerHeight;

        const render = Render.create({
            element: host,
            engine,
            options: {
                width,
                height,
                background: "transparent",
                wireframes: false,
                pixelRatio: Math.min(window.devicePixelRatio, 2),
            },
        });

        const WALL = 120;
        const walls = [
            Bodies.rectangle(width / 2, height + WALL / 2, width * 2, WALL, { isStatic: true, render: { visible: false } }),
            Bodies.rectangle(-WALL / 2, height / 2, WALL, height * 10, { isStatic: true, render: { visible: false } }),
            Bodies.rectangle(width + WALL / 2, height / 2, WALL, height * 10, { isStatic: true, render: { visible: false } }),
        ];
        Composite.add(world, walls);

        /* The card, drawn once per body into a canvas and used as a sprite.
           Drawn at 2x then scaled down so the text stays crisp on retina.

           A white card on a white page is invisible, so this does what a real
           card does to separate itself from the page: a faint violet wash, a
           tinted hairline, and a soft drop shadow. The shadow is why the canvas
           carries PAD of transparent margin — it has to be able to fall outside
           the card's own bounds. The padding is symmetric and the sprite is
           centred on the body, so the card still lines up with its collider. */
        const PAD = 28;
        const drawCard = (text: string, emoji: string) => {
            const s = 2;
            const canvas = document.createElement("canvas");
            canvas.width = (CARD_W + PAD * 2) * s;
            canvas.height = (CARD_H + PAD * 2) * s;
            const ctx = canvas.getContext("2d");
            if (!ctx) return "";
            ctx.scale(s, s);
            ctx.translate(PAD, PAD);

            const r = RADIUS;
            const path = () => {
                ctx.beginPath();
                ctx.moveTo(r, 0);
                ctx.lineTo(CARD_W - r, 0);
                ctx.quadraticCurveTo(CARD_W, 0, CARD_W, r);
                ctx.lineTo(CARD_W, CARD_H - r);
                ctx.quadraticCurveTo(CARD_W, CARD_H, CARD_W - r, CARD_H);
                ctx.lineTo(r, CARD_H);
                ctx.quadraticCurveTo(0, CARD_H, 0, CARD_H - r);
                ctx.lineTo(0, r);
                ctx.quadraticCurveTo(0, 0, r, 0);
                ctx.closePath();
            };

            path();
            ctx.shadowColor = "rgba(23,21,48,0.22)";
            ctx.shadowBlur = 20;
            ctx.shadowOffsetY = 8;
            const grad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
            grad.addColorStop(0, "#ffffff");
            grad.addColorStop(1, "#f0eefc");
            ctx.fillStyle = grad;
            ctx.fill();

            // Everything after the fill must not inherit the shadow.
            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;

            path();
            ctx.strokeStyle = "rgba(79,70,229,0.28)";
            ctx.lineWidth = 1;
            ctx.stroke();

            // Emoji sits in a brand-tinted disc so the row has a fixed left rhythm.
            ctx.beginPath();
            ctx.arc(44, CARD_H / 2, 22, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(79,70,229,0.14)";
            ctx.fill();

            ctx.font = "27px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji'";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(emoji, 44, CARD_H / 2 + 1);

            ctx.fillStyle = "#17152f";
            ctx.font = "600 17px Inter, system-ui, sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(text, 78, CARD_H / 2);

            return canvas.toDataURL();
        };

        const moving = () => Composite.allBodies(world).filter((b) => !b.isStatic);

        const TARGET = 16;
        const HARD_CAP = 22;
        const SCALE = 0.72;

        const addCard = () => {
            if (moving().length >= HARD_CAP) return;
            const req = Common.choose(REQUESTS) as (typeof REQUESTS)[number];
            const texture = drawCard(req.text, req.emoji);
            const body = Bodies.rectangle(
                60 + Math.random() * Math.max(1, width - 120),
                -450 + Math.random() * 320,
                CARD_W * SCALE,
                CARD_H * SCALE,
                {
                    chamfer: { radius: RADIUS * SCALE },
                    restitution: 0.15,
                    friction: 0.45,
                    angle: (Math.random() - 0.5) * 0.5,
                    render: { sprite: { texture, xScale: SCALE / 2, yScale: SCALE / 2 } },
                },
            );
            Composite.add(world, body);
        };

        const mouse = Mouse.create(render.canvas);
        const mouseConstraint = MouseConstraint.create(engine, {
            mouse,
            constraint: { stiffness: 0.2, render: { visible: false } },
        });
        Composite.add(world, mouseConstraint);

        // Matter binds wheel handlers to steal scroll; give them back to the page,
        // which matters doubly here because Lenis is driving smooth scroll.
        const m = mouse as unknown as { mousewheel: EventListener };
        mouse.element.removeEventListener("mousewheel", m.mousewheel);
        mouse.element.removeEventListener("DOMMouseScroll", m.mousewheel);

        Render.run(render);
        const runner = Runner.create();
        Runner.run(runner, engine);

        let running = true;
        let visible = true;
        const io = new IntersectionObserver(
            ([entry]) => {
                visible = entry.isIntersecting;
                if (visible && !running) {
                    Runner.run(runner, engine);
                    Render.run(render);
                    running = true;
                } else if (!visible && running) {
                    Runner.stop(runner);
                    Render.stop(render);
                    running = false;
                }
            },
            { threshold: 0 },
        );
        io.observe(host);

        const interval = setInterval(() => {
            if (!visible) return;
            moving().forEach((b) => {
                if (b.position.y > height + 500 || b.position.x < -500 || b.position.x > width + 500) {
                    Composite.remove(world, b);
                }
            });
            if (moving().length < TARGET) addCard();
        }, 260);

        const onResize = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            render.canvas.width = width;
            render.canvas.height = height;
            render.options.width = width;
            render.options.height = height;
            Matter.Body.setPosition(walls[0], { x: width / 2, y: height + WALL / 2 });
            Matter.Body.setPosition(walls[2], { x: width + WALL / 2, y: height / 2 });
        };
        window.addEventListener("resize", onResize);

        return () => {
            window.removeEventListener("resize", onResize);
            clearInterval(interval);
            io.disconnect();
            Render.stop(render);
            Runner.stop(runner);
            render.canvas.remove();
            Composite.clear(world, false);
            Engine.clear(engine);
        };
    }, []);

    return <div ref={sceneRef} className="absolute inset-0 z-[3] hidden lg:block" />;
}
