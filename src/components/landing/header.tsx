import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Header() {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-white/10 bg-background/60 backdrop-blur-xl transition-all duration-300">
      <div className="container mx-auto px-4 md:px-8 flex h-20 max-w-screen-2xl items-center justify-between">
        <div className="flex items-center gap-10">
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="bg-primary p-2 rounded-xl group-hover:scale-110 transition-transform">
              <svg
                role="img"
                aria-label="HangHut logo"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 256 256"
                className="h-6 w-6 text-primary-foreground"
                fill="currentColor"
              >
                <path d="M224,128a96,96,0,1,1-96-96A96,96,0,0,1,224,128ZM200,96a24,24,0,1,0-24,24A24,24,0,0,0,200,96ZM80,96a24,24,0,1,0-24,24A24,24,0,0,0,80,96Zm96,88H80a56,56,0,0,1,96,0Z" />
              </svg>
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
