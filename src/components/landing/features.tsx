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
import dynamic from 'next/dynamic';
import { FeatureCard } from "./feature-card";
import { UserFeatures } from "./user-features";
import PhysicsEcosystem from "./physics-ecosystem";

const SocialVortex = dynamic(() => import('./social-vortex'), {
  ssr: false,
  loading: () => <div className="w-full h-[300px] bg-white/50 backdrop-blur-sm rounded-[30px]" />
});

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

          {/* 1. Discover Real Plans */}
          <FeatureCard
            index={0}
            title="Curated Local Discovery"
            description="Stop endlessly scrolling through group chats. We show you exactly what's happening around you right now. Tap into a daily feed of events, activities, and verified communities."
            icon={<MapPin className="h-10 w-10 text-primary" />}
            color="bg-indigo-50/80"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white/50 rounded-2xl flex flex-col gap-2">
                <Users className="h-6 w-6 text-indigo-600" />
                <span className="text-sm font-bold">Find Your Crowd</span>
                <p className="text-xs text-muted-foreground font-medium">Connect with people who share your vibe.</p>
              </div>
              <div className="p-4 bg-white/50 rounded-2xl flex flex-col gap-2">
                <Zap className="h-6 w-6 text-indigo-600" />
                <span className="text-sm font-bold">Live Social Feed</span>
                <p className="text-xs text-muted-foreground font-medium">See what friends and locals are joining.</p>
              </div>
              <div className="p-4 bg-white/50 rounded-2xl flex flex-col gap-2">
                <ShieldCheck className="h-6 w-6 text-indigo-600" />
                <span className="text-sm font-bold">Verified Places</span>
                <p className="text-xs text-muted-foreground font-medium">Safe, curated, and highly rated spots.</p>
              </div>
              <div className="p-4 bg-white/50 rounded-2xl flex flex-col gap-2">
                <MapPin className="h-6 w-6 text-indigo-600" />
                <span className="text-sm font-bold">Interactive Map</span>
                <p className="text-xs text-muted-foreground font-medium">Explore trending activities visually.</p>
              </div>
            </div>
          </FeatureCard>

          {/* 2. User Features (Bento Grid) */}
          <UserFeatures />


        </div>
      </div>
    </section>
  );
}

