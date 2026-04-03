'use client'

import { TemplateName, TEMPLATE_META, getTemplateSections, StorefrontSection } from '@/lib/storefront/section-types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { LayoutTemplate, Layout, Type, Zap } from 'lucide-react'

const TEMPLATE_ICONS: Record<TemplateName, any> = {
    modern: LayoutTemplate,
    classic: Layout,
    minimal: Type,
    bold: Zap,
}

// Visual preview thumbnails for each template
const TEMPLATE_PREVIEWS: Record<TemplateName, React.ReactNode> = {
    modern: (
        <div className="w-full h-24 bg-muted rounded-lg flex gap-1.5 p-1.5 overflow-hidden">
            <div className="w-1/3 bg-background rounded border shadow-sm h-full" />
            <div className="w-2/3 space-y-1.5">
                <div className="w-full h-8 bg-background rounded border shadow-sm" />
                <div className="grid grid-cols-2 gap-1">
                    <div className="h-12 bg-background rounded border shadow-sm" />
                    <div className="h-12 bg-background rounded border shadow-sm" />
                </div>
            </div>
        </div>
    ),
    classic: (
        <div className="w-full h-24 bg-muted rounded-lg space-y-1.5 p-1.5 overflow-hidden">
            <div className="w-full h-10 bg-background rounded border shadow-sm" />
            <div className="grid grid-cols-3 gap-1">
                <div className="h-10 bg-background rounded border shadow-sm" />
                <div className="h-10 bg-background rounded border shadow-sm" />
                <div className="h-10 bg-background rounded border shadow-sm" />
            </div>
        </div>
    ),

    minimal: (
        <div className="w-full h-24 bg-muted rounded-lg flex flex-col items-center justify-center gap-1 p-1.5 overflow-hidden">
            <div className="w-16 h-3 bg-background rounded border shadow-sm" />
            <div className="w-24 h-2 bg-background/70 rounded" />
            <div className="grid grid-cols-2 gap-1 mt-1 w-full">
                <div className="h-10 bg-background rounded border shadow-sm" />
                <div className="h-10 bg-background rounded border shadow-sm" />
            </div>
        </div>
    ),
    bold: (
        <div className="w-full h-24 bg-zinc-800 rounded-lg space-y-1.5 p-1.5 overflow-hidden">
            <div className="w-full h-10 bg-zinc-700 rounded" />
            <div className="flex gap-1 justify-center">
                <div className="w-12 h-4 bg-primary/60 rounded text-[6px] text-center text-white">50+</div>
                <div className="w-12 h-4 bg-primary/60 rounded text-[6px] text-center text-white">10K</div>
                <div className="w-12 h-4 bg-primary/60 rounded text-[6px] text-center text-white">5</div>
            </div>
            <div className="grid grid-cols-2 gap-1">
                <div className="h-5 bg-zinc-700 rounded" />
                <div className="h-5 bg-zinc-700 rounded" />
            </div>
        </div>
    ),
}

interface SectionTemplatesProps {
    currentTemplate?: TemplateName | null
    onApply: (sections: StorefrontSection[], template: TemplateName) => void
}

export function SectionTemplates({ currentTemplate, onApply }: SectionTemplatesProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Start from a Template</CardTitle>
                <CardDescription>
                    Choose a layout template to pre-fill your sections. You can customize everything after.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {(Object.keys(TEMPLATE_META) as TemplateName[]).map((name) => {
                        const meta = TEMPLATE_META[name]
                        const Icon = TEMPLATE_ICONS[name]
                        const isActive = currentTemplate === name

                        return (
                            <button
                                key={name}
                                type="button"
                                onClick={() => onApply(getTemplateSections(name), name)}
                                className={cn(
                                    'border-2 rounded-xl p-3 text-left hover:border-primary/50 transition-all flex flex-col gap-2',
                                    isActive ? 'border-primary bg-primary/5 shadow-sm' : 'border-border'
                                )}
                            >
                                {TEMPLATE_PREVIEWS[name]}
                                <div className="mt-1">
                                    <p className="font-semibold text-sm flex items-center gap-1.5">
                                        <Icon className="h-3.5 w-3.5" />
                                        {meta.label}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                                        {meta.description}
                                    </p>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}
