import Link from "next/link";
import Image from "next/image";
import { MapPin, Mail } from "lucide-react";

export default function Footer() {
  return (
    <footer className="w-full py-8 md:px-8 md:py-10 border-t bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col md:flex-row justify-between gap-6">
          {/* Company info */}
          <div className="space-y-3">
            <Image src="/logo_transparent.png" alt="HangHut" width={120} height={40} className="h-8 w-auto" />
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Level 40, PBCom Tower, Ayala Ave, Makati City, 1226 Metro Manila</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="w-4 h-4 shrink-0" />
              <a href="mailto:contact@hanghut.com" className="hover:text-foreground transition-colors">contact@hanghut.com</a>
            </div>
          </div>

          {/* Links */}
          <div className="flex flex-col md:items-end gap-2">
            <div className="flex gap-4">
              <Link href="/docs/api" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Developer
              </Link>
              <Link href="/terms-of-service" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Terms of Service
              </Link>
              <Link href="/privacy-policy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Privacy Policy
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} HangHut. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
