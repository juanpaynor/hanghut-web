import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import { LogIn } from "lucide-react";


export default function Header() {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-white/10 bg-background/60 backdrop-blur-xl transition-all duration-300">
      <div className="container mx-auto px-6 md:px-12 flex h-20 max-w-7xl items-center justify-between">
        <div className="flex items-center gap-10">
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="relative h-12 w-12 overflow-hidden transition-transform group-hover:scale-110">
              <Image
                src="/logo_transparent.png"
                alt="HangHut Logo"
                fill
                className="object-contain"
              />
            </div>
          </Link>
        </div>

        <nav className="flex items-center space-x-2 md:space-x-4">
          <Link href="/events" className="hidden md:block">
            <Button variant="ghost" className="font-bold text-sm tracking-widest uppercase hover:bg-white/10">
              Events
            </Button>
          </Link>
          <Link href="/ticketing" className="hidden md:block">
            <Button variant="ghost" className="font-bold text-sm tracking-widest uppercase hover:bg-white/10">
              Become a Partner
            </Button>
          </Link>
          <Link href="/pricing" className="hidden md:block">
            <Button variant="ghost" className="font-bold text-sm tracking-widest uppercase hover:bg-white/10">
              Pricing
            </Button>
          </Link>

          {/* Divider separating browse links from account actions */}
          <div className="hidden md:block h-6 w-px bg-white/15 mx-1" aria-hidden="true" />

          {/* Account action — outlined pill + icon so it reads as "sign in", not a nav link */}
          <Link href="/organizer/login">
            <Button
              variant="outline"
              className="gap-2 rounded-full border-white/25 bg-transparent px-4 font-semibold text-sm hover:bg-white/10 hover:text-foreground"
            >
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline">Log In</span>
            </Button>
          </Link>
          <a
            href="https://apps.apple.com/ph/app/hanghut-social-hangouts/id6764278827"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button className="rounded-full px-4 md:px-6 transition-all hover:scale-105">
              Download App
            </Button>
          </a>
        </nav>
      </div>
    </header>
  );
}
