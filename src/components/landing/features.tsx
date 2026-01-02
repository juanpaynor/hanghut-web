"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { BadgeCheck, MapPin, Users, Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    icon: <MapPin className="h-12 w-12 text-primary mb-4" />,
    title: "Live Activity Map",
    description: "See what’s happening around you in real time. Hiking. Gaming. Art. If people are there, it shows.",
    color: "bg-indigo-50/50"
  },
  {
    icon: <Users className="h-12 w-12 text-primary mb-4" />,
    title: "Focused Social Feed",
    description: "No noise. No doomscrolling. Just threads and updates from the activities you actually join.",
    color: "bg-blue-50/50"
  },
  {
    icon: <Globe className="h-12 w-12 text-primary mb-4" />,
    title: "Open Crews",
    description: "Jump into public hangouts or start your own. No matchmaking. No pressure. Just show up.",
    color: "bg-purple-50/50"
  },
  {
    icon: <BadgeCheck className="h-12 w-12 text-primary mb-4" />,
    title: "Profiles That Matter",
    description: "Interests over selfies. Earn badges, host events, and build a real reputation.",
    color: "bg-pink-50/50"
  },
];

export default function Features() {
  return (
    <section className="relative w-full py-24 bg-background">
      <div className="container mx-auto px-4">

        {/* Header Section */}
        <div className="max-w-4xl mx-auto mb-20 text-center space-y-6">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-5xl md:text-7xl font-headline font-bold tracking-tighter"
          >
            Real life. <br />
            Real people. <br />
            <span className="text-primary">Right now.</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-xl md:text-2xl text-muted-foreground font-light"
          >
            Find events. Get tickets. Live the experience. <br />
            <span className="text-foreground font-medium">HangHut pulls you out of endless scrolling and into actual meetups.</span>
          </motion.p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
            >
              <Card className={`h-full p-8 rounded-[40px] border-0 shadow-sm hover:shadow-md transition-shadow ${feature.color}`}>
                <CardHeader>
                  {feature.icon}
                  <CardTitle className="text-3xl font-headline font-bold">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}
