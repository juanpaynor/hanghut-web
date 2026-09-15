import LandingHeader from "@/components/landing/scenes/header";

/**
 * The public-site header. One nav for every public page — events, pricing,
 * ticketing, capabilities, use cases — so the "For organizers" menu and the
 * store CTA are the same wherever a visitor lands. The organizer dashboard
 * has its own chrome and does not use this.
 *
 * This used to be a separate, simpler bar; it now just mounts the landing's
 * header. The display/mono faces it uses are linked here (React hoists the
 * tag into <head>) so a page gets them by mounting the header, and the
 * dashboard — which never mounts it — never pays for them.
 */
export default function Header() {
    return (
        <>
            <link
                rel="stylesheet"
                href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=JetBrains+Mono:wght@400;500&display=swap"
            />
            <LandingHeader />
        </>
    );
}
