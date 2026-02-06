"use client";

import { motion } from "framer-motion";
import {
  MapPin,
  Ticket,
  Zap,
  Plane,
  Users,
  ShieldCheck,
  Smartphone,
  MousePointer2
} from "lucide-react";
import { FeatureCard } from "./feature-card";
import PhysicsEcosystem from "./physics-ecosystem";

export default function Features() {
  return (
    <section className="relative w-full py-32 bg-background overflow-hidden">
      {/* Background Physics Layer for features */}
      <PhysicsEcosystem />

      <div className="container relative z-10 mx-auto px-4">
        {/* Header Section */}
        <div className="max-w-4xl mx-auto mb-24 text-center space-y-6">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-5xl md:text-8xl font-headline font-bold tracking-tighter"
          >
            From Web Ticket to <br />
            <span className="text-primary italic">Real Connection.</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-2xl text-muted-foreground font-light max-w-2xl mx-auto"
          >
            HangHut bridges the gap between digital discovery and real-world community.
          </motion.p>
        </div>

        {/* Dynamic Feature Sections */}
        <div className="space-y-16 md:space-y-32">

          {/* 1. Host or Join Activities */}
          <FeatureCard
            index={0}
            title="Host or Join Activities"
            description="Don't just scroll—explore. Use our interactive map to instantly discover activities near you. See a vibe you like? Join the crew, or drop a pin to host your own experience."
            icon={<MapPin className="h-10 w-10 text-primary" />}
            color="bg-indigo-50/80"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white/50 rounded-2xl flex flex-col gap-2">
                <Users className="h-6 w-6 text-indigo-600" />
                <span className="text-sm font-bold">Group Sizes</span>
                <p className="text-xs text-muted-foreground font-medium">Set the perfect limit for your vibe.</p>
              </div>
              <div className="p-4 bg-white/50 rounded-2xl flex flex-col gap-2">
                <Zap className="h-6 w-6 text-indigo-600" />
                <span className="text-sm font-bold">Vibe Custom</span>
                <p className="text-xs text-muted-foreground font-medium">Use GIFs, videos, and themes.</p>
              </div>
              <div className="p-4 bg-white/50 rounded-2xl flex flex-col gap-2">
                <ShieldCheck className="h-6 w-6 text-indigo-600" />
                <span className="text-sm font-bold">Preferences</span>
                <p className="text-xs text-muted-foreground font-medium">Women-only or compatibility filters.</p>
              </div>
              <div className="p-4 bg-white/50 rounded-2xl flex flex-col gap-2">
                <MapPin className="h-6 w-6 text-indigo-600" />
                <span className="text-sm font-bold">Drop a Pin</span>
                <p className="text-xs text-muted-foreground font-medium">Instant real-world map discovery.</p>
              </div>
            </div>
          </FeatureCard>

          {/* 2. Hybrid Ticketing */}
          <FeatureCard
            index={1}
            title="Hybrid Ticketing System"
            description="We eliminate the 'install barrier' with a dual-layer system designed to maximize conversion from browser to real life."
            icon={<Ticket className="h-10 w-10 text-primary" />}
            color="bg-pink-50/80"
          >
            <div className="space-y-4">
              <div className="p-6 bg-white/80 rounded-3xl border border-pink-100 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <MousePointer2 className="h-5 w-5 text-pink-500" />
                  <span className="font-bold">No-Install Web Checkout</span>
                </div>
                <p className="text-sm text-muted-foreground">Casual users purchase instantly via mobile-web links.</p>
              </div>
              <div className="p-6 bg-primary text-primary-foreground rounded-3xl shadow-xl shadow-primary/20 scale-105">
                <div className="flex items-center gap-3 mb-2">
                  <Smartphone className="h-5 w-5" />
                  <span className="font-bold">The Native App Experience</span>
                </div>
                <p className="text-sm opacity-90">Nudge users to the app for exclusive perks and incentives.</p>
              </div>
            </div>
          </FeatureCard>

          {/* 3. My Trips / Instant Social Circle */}
          <FeatureCard
            index={2}
            title="My Trips"
            description="Match with fellow Hanghut users in the same city, on the same dates. You are instantly dropped into a destination group chat."
            icon={<Plane className="h-10 w-10 text-primary" />}
            color="bg-blue-50/80"
          >
            <div className="relative p-6 bg-white/80 rounded-[30px] border border-blue-100 min-h-[200px] flex flex-col justify-center overflow-hidden">
              <div className="relative z-10 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">H</div>
                  <div className="bg-blue-100 p-3 rounded-2xl rounded-tl-none">
                    <p className="text-xs font-bold text-blue-900">Anyone up for dinner in Tokyo?</p>
                  </div>
                </div>
                <div className="flex flex-row-reverse items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold">J</div>
                  <div className="bg-indigo-100 p-3 rounded-2xl rounded-tr-none">
                    <p className="text-xs font-bold text-indigo-900">I'm there on the 10th! Let's go!</p>
                  </div>
                </div>
                <div className="pt-2 text-center text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                  Instant Social Circle
                </div>
              </div>
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Users className="h-24 w-24 text-blue-600" />
              </div>
            </div>
          </FeatureCard>

        </div>
      </div>
    </section>
  );
}

