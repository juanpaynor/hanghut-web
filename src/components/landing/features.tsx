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
import { OrganizerFeatures } from "./organizer-features";
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

          {/* 1. Organic Marketing / Reach */}
          <FeatureCard
            index={0}
            title="Instant Organic Reach"
            description="We show your event to thousands of users organically on our social app. No paid ads, just pure community discovery. Tap into a waiting audience of locals and travelers."
            icon={<Zap className="h-10 w-10 text-primary" />}
            color="bg-indigo-50/80"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white/50 rounded-2xl flex flex-col gap-2">
                <Users className="h-6 w-6 text-indigo-600" />
                <span className="text-sm font-bold">Thousands of Eyes</span>
                <p className="text-xs text-muted-foreground font-medium">Auto-promoted to nearby users.</p>
              </div>
              <div className="p-4 bg-white/50 rounded-2xl flex flex-col gap-2">
                <Zap className="h-6 w-6 text-indigo-600" />
                <span className="text-sm font-bold">Zero Ad Spend</span>
                <p className="text-xs text-muted-foreground font-medium">Growth is built into the platform.</p>
              </div>
              <div className="p-4 bg-white/50 rounded-2xl flex flex-col gap-2">
                <ShieldCheck className="h-6 w-6 text-indigo-600" />
                <span className="text-sm font-bold">Vibe Compatibility</span>
                <p className="text-xs text-muted-foreground font-medium">Match with the right crowd.</p>
              </div>
              <div className="p-4 bg-white/50 rounded-2xl flex flex-col gap-2">
                <MapPin className="h-6 w-6 text-indigo-600" />
                <span className="text-sm font-bold">Map Discovery</span>
                <p className="text-xs text-muted-foreground font-medium">Be visible on the social map.</p>
              </div>
            </div>
          </FeatureCard>

          {/* 2. Hybrid Ticketing & Organizer Toolkit (Bento Grid) */}
          <OrganizerFeatures />


        </div>
      </div>
    </section>
  );
}

