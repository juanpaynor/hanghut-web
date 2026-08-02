"use client";

import Image from "next/image";
import { Reveal } from "@/components/landing/reveal";
import { StoreButtons } from "@/components/landing/store-buttons";
import { Ticket, Compass, MapPin, Users } from "lucide-react";

/**
 * "FOR ATTENDEES / Find your people" — the users/social story, told as clean
 * vertical alternating rows that reveal on scroll. Replaces the old GSAP pinned
 * horizontal-scroll track (which cloned itself into 3 copies). No pinning, no
 * window math — reliable and mobile-first.
 */
const ROWS = [
    {
        icon: Ticket,
        eyebrow: "Discover",
        title: "Find events near you",
        body: "Browse curated events happening around you — from intimate pop-ups to sold-out parties. Grab tickets in a couple of taps.",
        image: "/features/feature-tickets.png",
    },
    {
        icon: Compass,
        eyebrow: "Experiences",
        title: "Join curated experiences",
        body: "Hand-picked, verified experiences run by trusted local hosts. No guesswork — just show up and enjoy.",
        image: "/features/feature-experiences.png",
    },
    {
        icon: MapPin,
        eyebrow: "Travel",
        title: "Plan trips together",
        body: "Heading somewhere new? Map out your trip and connect with others going to the same place.",
        image: "/features/feature-trips.png",
    },
    {
        icon: Users,
        eyebrow: "Hangouts",
        title: "Meet people, make plans",
        body: "Start your own hangout or join one nearby — coffee, hiking, gaming, whatever you're into. Real connections, offline.",
        image: "/features/feature-activities.png",
    },
];

export default function AttendeeTrack() {
    return (
        <section className="bg-kinetic-ink py-24 md:py-32">
            <div className="mx-auto max-w-7xl px-6 md:px-12">
                <Reveal>
                    <div className="flex items-center gap-3">
                        <span className="h-2 w-2 rounded-full bg-kinetic-brand" />
                        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-kinetic-brand">For attendees</span>
                    </div>
                    <h2 className="mt-4 max-w-3xl font-headline text-4xl font-bold leading-[1] tracking-tight text-kinetic-text md:text-6xl">
                        Find your people.
                    </h2>
                    <p className="mt-5 max-w-xl text-lg text-kinetic-muted">
                        Everything to discover what&apos;s on and who&apos;s going — in one app.
                    </p>
                </Reveal>

                <div className="mt-16 flex flex-col gap-16 md:gap-24">
                    {ROWS.map((row, i) => {
                        const Icon = row.icon;
                        const flip = i % 2 === 1;
                        return (
                            <Reveal key={row.title}>
                                <div className="grid items-center gap-8 md:grid-cols-2 md:gap-14">
                                    {/* Text */}
                                    <div className={flip ? "md:order-2" : ""}>
                                        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-kinetic-brand/10">
                                            <Icon className="h-6 w-6 text-kinetic-brand" />
                                        </div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-kinetic-muted">{row.eyebrow}</p>
                                        <h3 className="mt-3 font-headline text-3xl font-bold tracking-tight text-kinetic-text md:text-4xl">{row.title}</h3>
                                        <p className="mt-4 max-w-md text-base leading-relaxed text-kinetic-muted md:text-lg">{row.body}</p>
                                    </div>
                                    {/* Image */}
                                    <div className={flip ? "md:order-1" : ""}>
                                        <div className="relative mx-auto aspect-[4/3] w-full max-w-lg overflow-hidden rounded-3xl border border-kinetic-line bg-kinetic-panel">
                                            <div className="absolute right-0 top-0 h-56 w-56 -translate-y-1/3 translate-x-1/3 rounded-full bg-kinetic-brand/10 blur-3xl" />
                                            <Image src={row.image} alt={row.title} fill className="object-contain p-6" />
                                        </div>
                                    </div>
                                </div>
                            </Reveal>
                        );
                    })}
                </div>

                {/* App CTA */}
                <Reveal className="mt-16 flex flex-col items-center gap-5 rounded-3xl border border-kinetic-line bg-kinetic-panel px-6 py-12 text-center">
                    <h3 className="font-headline text-2xl font-bold text-kinetic-text md:text-3xl">Get the app. Go do something.</h3>
                    <p className="max-w-md text-kinetic-muted">Free on iOS and Android — your next hangout is a tap away.</p>
                    <StoreButtons variant="dark" />
                </Reveal>
            </div>
        </section>
    );
}
