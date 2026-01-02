import { BadgeCheck, MapPin, Users } from "lucide-react";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const features = [
  {
    icon: <MapPin className="h-8 w-8 text-primary" />,
    title: "Map View",
    description: "Explore restaurants and dining groups near you on an interactive map.",
  },
  {
    icon: <Users className="h-8 w-8 text-primary" />,
    title: "Group Chats",
    description: "Coordinate plans, share recommendations, and get to know your bitemates before you meet.",
  },
  {
    icon: <BadgeCheck className="h-8 w-8 text-primary" />,
    title: "Verified Profiles",
    description: "Dine with confidence. Our verification process ensures a safe and friendly community.",
  },
];

export default function Features() {
  return (
    <section id="features" className="w-full py-20 md:py-32 bg-secondary">
      <div className="container mx-auto space-y-12 px-4 md:px-6">
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          <div className="space-y-2">
            <div className="inline-block rounded-lg bg-muted px-3 py-1 text-sm">Key Features</div>
            <h2 className="font-headline text-3xl font-bold tracking-tighter sm:text-5xl text-foreground">
              Everything you need to dine out
            </h2>
            <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              Bitemates is packed with features to make finding and joining dining experiences seamless and enjoyable.
            </p>
          </div>
        </div>
        <div className="mx-auto grid max-w-5xl items-start gap-8 sm:grid-cols-2 md:grid-cols-3 md:gap-12 lg:max-w-none">
          {features.map((feature) => (
            <Card key={feature.title} className="bg-card rounded-lg shadow-md hover:shadow-xl transition-shadow border-transparent">
              <CardHeader className="items-center text-center gap-4 p-8">
                <div className="bg-primary/10 p-4 rounded-full">
                  {feature.icon}
                </div>
                <CardTitle className="font-headline text-2xl">{feature.title}</CardTitle>
                <CardDescription className="text-base">{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
