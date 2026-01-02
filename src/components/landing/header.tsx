import { Button } from "@/components/ui/button";
import { MagneticButton } from "@/components/ui/magnetic-button";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center">
        <div className="mr-4 flex">
          <a href="/" className="mr-6 flex items-center space-x-2">
            <svg
              role="img"
              aria-label="Bitemates logo"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 256 256"
              className="h-6 w-6 text-primary"
              fill="currentColor"
            >
              <path d="M224,128a96,96,0,1,1-96-96A96,96,0,0,1,224,128ZM200,96a24,24,0,1,0-24,24A24,24,0,0,0,200,96ZM80,96a24,24,0,1,0-24,24A24,24,0,0,0,80,96Zm96,88H80a56,56,0,0,1,96,0Z" />
            </svg>
            <span className="font-bold font-headline">HangHut</span>
          </a>
        </div>
        <nav className="flex flex-1 items-center justify-end space-x-2">
          <Button>Download App</Button>
        </nav>
      </div>
    </header>
  );
}
