import Link from "next/link";
import Image from "next/image";
import { MapPin, Mail, Instagram } from "lucide-react";
import { StoreButtons } from "@/components/landing/store-buttons";

const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Ticketing", href: "/ticketing" },
      { label: "Experiences", href: "/experiences" },
      { label: "Discover Events", href: "/events" },
      { label: "Download App", href: "/download" },
    ],
  },
  {
    title: "Use Cases",
    links: [
      { label: "Live Music & Concerts", href: "/use-cases/live-music" },
      { label: "Sports & Fitness", href: "/use-cases/sports-fitness" },
      { label: "Markets & Pop-ups", href: "/use-cases/markets-popups" },
      { label: "All use cases", href: "/use-cases" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Become a Partner", href: "/ticketing" },
      { label: "Partner Login", href: "/organizer/login" },
      { label: "Contact", href: "mailto:contact@hanghut.com", external: true },
      { label: "Developers", href: "/docs/api" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of Service", href: "/terms-of-service" },
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Child Safety", href: "/child-safety" },
      { label: "Copyright", href: "/copyright" },
    ],
  },
];

const SOCIALS = [
  { label: "Instagram", href: "https://www.instagram.com/hanghut.app/", Icon: Instagram },
];

export default function Footer() {
  return (
    <footer className="w-full border-t bg-background">
      <div className="container mx-auto px-4 py-12 md:px-6 md:py-14">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-3 lg:grid-cols-6">
          {/* Brand column */}
          <div className="col-span-2 space-y-4">
            <Image src="/logo_transparent.png" alt="HangHut" width={120} height={40} className="h-8 w-auto" />
            <p className="max-w-xs text-sm text-muted-foreground">
              Discover activities, sell tickets, and gather your crew — all in one place.
            </p>
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Level 40, PBCom Tower, Ayala Ave, Makati City, 1226 Metro Manila</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4 shrink-0" />
              <a href="mailto:contact@hanghut.com" className="hover:text-foreground transition-colors">
                contact@hanghut.com
              </a>
            </div>
            {/* Socials */}
            <div className="flex items-center gap-3 pt-1">
              {SOCIALS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title} className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">{col.title}</h3>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* App badges */}
        <div className="mt-10 border-t pt-8">
          <p className="mb-3 text-sm font-medium text-foreground">Get the app</p>
          <StoreButtons variant="dark" className="!items-start !justify-start" />
        </div>

        {/* Bottom bar */}
        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t pt-6 md:flex-row">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} HangHut. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">Made in the Philippines 🇵🇭</p>
        </div>
      </div>
    </footer>
  );
}
