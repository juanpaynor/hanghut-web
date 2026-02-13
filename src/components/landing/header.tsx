import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";

export default function Header() {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-white/10 bg-background/60 backdrop-blur-xl transition-all duration-300">
      <div className="container mx-auto px-6 md:px-12 flex h-20 max-w-7xl items-center justify-between">
        <div className="flex items-center gap-10">
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="relative h-10 w-10 overflow-hidden rounded-xl transition-transform group-hover:scale-110">
              <Image
                src="/logo.png"
                alt="HangHut Logo"
                fill
                className="object-cover"
              />
            </div>
            <span className="font-bold font-headline text-2xl tracking-tighter">HangHut</span>
          </Link>
        </div>

        <nav className="flex items-center space-x-4">
          <Link href="/organizer/login">
            <Button variant="ghost" className="font-bold text-sm tracking-widest uppercase hover:bg-white/10">
              Partner Login
            </Button>
          </Link>
          <Button className="rounded-full px-6 transition-all hover:scale-105">
            Download App
          </Button>
        </nav>
      </div>
    </header>
  );
}
