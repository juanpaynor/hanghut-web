import Image from "next/image";
import { Button } from "@/components/ui/button";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { ArrowRight } from "lucide-react";

export default function Hero() {
  const heroImage = PlaceHolderImages.find(p => p.id === 'iphone-mockup');

  return (
    <section className="w-full py-24 md:py-32 lg:py-40 bg-background overflow-hidden">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="space-y-6 text-center lg:text-left">
            <h1 className="font-headline text-4xl font-bold tracking-tighter text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
              Dining is Better Together
            </h1>
            <p className="max-w-xl mx-auto text-lg text-muted-foreground lg:mx-0 md:text-xl">
              Discover amazing food and even better company. Bitemates connects you with local foodies for unforgettable dining experiences.
            </p>
            <div className="flex justify-center lg:justify-start">
              <Button size="lg" className="shadow-lg shadow-primary/50 hover:shadow-xl hover:shadow-primary/60 transition-shadow rounded-full px-8 py-3 h-auto text-lg font-semibold">
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
          <div className="relative flex items-center justify-center animate-float">
            {heroImage && (
              <div className="relative w-[300px] h-[600px] lg:w-[320px] lg:h-[640px]">
                <div className="absolute -inset-4 bg-gradient-to-br from-primary/20 to-transparent rounded-[60px] blur-2xl"></div>
                <div className="relative w-full h-full p-2 bg-white/60 rounded-[50px] shadow-2xl backdrop-blur-lg border border-white/30">
                  <Image
                    src={heroImage.imageUrl}
                    alt={heroImage.description}
                    data-ai-hint={heroImage.imageHint}
                    fill
                    className="rounded-[40px] object-cover"
                    priority
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
