'use client'

import { useState, useEffect } from 'react'
import { StorefrontSection } from '@/lib/storefront/section-types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface StorefrontNavbarProps {
    partner: {
        business_name: string
        profile_photo_url?: string | null
    }
    sections: StorefrontSection[]
    fontClass?: string
}

export function StorefrontNavbar({ partner, sections, fontClass }: StorefrontNavbarProps) {
    const [scrolled, setScrolled] = useState(false)

    useEffect(() => {
        const handleScroll = () => {
            const isScrolled = window.scrollY > 50
            if (isScrolled !== scrolled) {
                setScrolled(isScrolled)
            }
        }

        window.addEventListener('scroll', handleScroll, { passive: true })
        handleScroll() // Check immediately on mount

        return () => {
            window.removeEventListener('scroll', handleScroll)
        }
    }, [scrolled])

    // Generate links based on visible sections
    const getSectionLinks = () => {
        const links: { id: string; label: string }[] = []
        
        sections.forEach(section => {
            if (!section.visible) return

            switch (section.type) {
                case 'about':
                    links.push({ id: 'about', label: 'About Us' })
                    break
                case 'events':
                    links.push({ id: 'events', label: 'Upcoming Events' })
                    break
                case 'past_events':
                    links.push({ id: 'past-events', label: 'Past Events' })
                    break
                case 'gallery':
                    links.push({ id: 'gallery', label: 'Gallery' })
                    break
                case 'newsletter':
                    links.push({ id: 'newsletter', label: 'Subscribe' })
                    break
            }
        })
        return links
    }

    const links = getSectionLinks()
    const hasEvents = links.some(l => l.id === 'events')

    return (
        <header
            className={cn(
                "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
                fontClass,
                scrolled 
                    ? "bg-background/90 backdrop-blur-md border-b shadow-sm py-3" 
                    : "bg-transparent py-5"
            )}
        >
            <div className="container mx-auto px-4 lg:px-8">
                <div className="flex items-center justify-between">
                    
                    {/* Left: Brand */}
                    <a 
                        href="#"
                        onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }} 
                        className="flex items-center gap-3 group"
                    >
                        {partner.profile_photo_url && (
                            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-primary/20 group-hover:border-primary transition-colors">
                                <img src={partner.profile_photo_url} alt={partner.business_name} className="w-full h-full object-cover" />
                            </div>
                        )}
                        <span className={cn(
                            "font-bold text-lg tracking-tight transition-colors",
                            scrolled ? "text-foreground" : "text-white drop-shadow-md"
                        )}>
                            {partner.business_name}
                        </span>
                    </a>

                    {/* Center: Desktop Navigation */}
                    <nav className="hidden md:flex items-center gap-6">
                        {links.map(link => (
                            <a
                                key={link.id}
                                href={`#${link.id}`}
                                className={cn(
                                    "text-sm font-medium transition-colors hover:text-primary",
                                    scrolled ? "text-muted-foreground" : "text-white/80 drop-shadow-sm hover:text-white"
                                )}
                            >
                                {link.label}
                            </a>
                        ))}
                    </nav>

                    {/* Right: CTA */}
                    <div className="flex items-center gap-4">
                        {hasEvents && (
                            <Button 
                                asChild
                                className={cn(
                                    "rounded-full font-bold transition-all shadow-lg",
                                    scrolled 
                                        ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                                        : "bg-white text-black hover:bg-white/90"
                                )}
                            >
                                <a href="#events">
                                    Get Tickets
                                </a>
                            </Button>
                        )}
                    </div>

                </div>
            </div>
        </header>
    )
}
