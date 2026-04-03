'use client'

import { useState } from 'react'
import { StorefrontSection, SECTION_META, DEFAULT_SECTION_CONFIG, SectionType } from '@/lib/storefront/section-types'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
    ArrowUp, ArrowDown, Trash2, Plus, Image, FileText, Calendar,
    History, GalleryHorizontal, Mail, BarChart3, Megaphone, Minus,
    ChevronDown, ChevronRight, GripVertical
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionConfigPanel } from './section-config-panel'
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

const ICON_MAP: Record<string, any> = {
    Image, FileText, Calendar, History, GalleryHorizontal, Mail, BarChart3, Megaphone, Minus,
}

interface SectionListProps {
    sections: StorefrontSection[]
    onChange: (sections: StorefrontSection[]) => void
}

export function SectionList({ sections, onChange }: SectionListProps) {
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

    const moveSection = (index: number, direction: 'up' | 'down') => {
        const newSections = [...sections]
        if (direction === 'up' && index > 0) {
            [newSections[index], newSections[index - 1]] = [newSections[index - 1], newSections[index]]
            if (expandedIndex === index) setExpandedIndex(index - 1)
            else if (expandedIndex === index - 1) setExpandedIndex(index)
        } else if (direction === 'down' && index < newSections.length - 1) {
            [newSections[index], newSections[index + 1]] = [newSections[index + 1], newSections[index]]
            if (expandedIndex === index) setExpandedIndex(index + 1)
            else if (expandedIndex === index + 1) setExpandedIndex(index)
        }
        onChange(newSections)
    }

    const toggleVisibility = (index: number) => {
        const newSections = [...sections]
        newSections[index] = { ...newSections[index], visible: !newSections[index].visible }
        onChange(newSections)
    }

    const removeSection = (index: number) => {
        const newSections = sections.filter((_, i) => i !== index)
        if (expandedIndex === index) setExpandedIndex(null)
        else if (expandedIndex !== null && expandedIndex > index) setExpandedIndex(expandedIndex - 1)
        onChange(newSections)
    }

    const addSection = (type: SectionType) => {
        const newSection: StorefrontSection = {
            type,
            visible: true,
            config: { ...DEFAULT_SECTION_CONFIG[type] },
        }
        onChange([...sections, newSection])
        setExpandedIndex(sections.length)
    }

    const updateSectionConfig = (index: number, config: Record<string, any>) => {
        const newSections = [...sections]
        newSections[index] = { ...newSections[index], config }
        onChange(newSections)
    }

    const toggleExpand = (index: number) => {
        setExpandedIndex(expandedIndex === index ? null : index)
    }

    // Available section types to add (exclude types already at max)
    const existingTypes = new Set(sections.map(s => s.type))
    const singletonTypes: SectionType[] = ['hero', 'about', 'newsletter', 'past_events']
    const availableTypes = (Object.keys(SECTION_META) as SectionType[]).filter(type => {
        if (singletonTypes.includes(type) && existingTypes.has(type)) return false
        return true
    })

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <GripVertical className="h-5 w-5 text-muted-foreground" />
                    Page Sections
                </CardTitle>
                <CardDescription>
                    Reorder, configure, or hide sections. Click a section to expand its settings.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    {sections.map((section, index) => {
                        const meta = SECTION_META[section.type]
                        const IconComp = ICON_MAP[meta?.icon] || FileText
                        const isExpanded = expandedIndex === index

                        return (
                            <div
                                key={`${section.type}-${index}`}
                                className={cn(
                                    'border rounded-xl overflow-hidden transition-all',
                                    isExpanded ? 'border-primary/30 bg-primary/5' : 'border-border hover:border-primary/20',
                                    !section.visible && 'opacity-50'
                                )}
                            >
                                {/* Section Header */}
                                <div className="flex items-center gap-2 p-3">
                                    {/* Reorder buttons */}
                                    <div className="flex flex-col gap-0.5">
                                        <Button
                                            type="button" variant="ghost" size="sm"
                                            className="h-5 w-5 p-0"
                                            onClick={() => moveSection(index, 'up')}
                                            disabled={index === 0}
                                        >
                                            <ArrowUp className="h-3 w-3" />
                                        </Button>
                                        <Button
                                            type="button" variant="ghost" size="sm"
                                            className="h-5 w-5 p-0"
                                            onClick={() => moveSection(index, 'down')}
                                            disabled={index === sections.length - 1}
                                        >
                                            <ArrowDown className="h-3 w-3" />
                                        </Button>
                                    </div>

                                    {/* Section info (clickable) */}
                                    <button
                                        type="button"
                                        onClick={() => toggleExpand(index)}
                                        className="flex-1 flex items-center gap-3 text-left"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                            <IconComp className="h-4 w-4 text-primary" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm truncate">{meta?.label || section.type}</p>
                                            <p className="text-xs text-muted-foreground truncate">{meta?.description}</p>
                                        </div>
                                        {isExpanded ? (
                                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                        )}
                                    </button>

                                    {/* Controls */}
                                    <div className="flex items-center gap-2 ml-2">
                                        <Switch
                                            checked={section.visible}
                                            onCheckedChange={() => toggleVisibility(index)}
                                        />
                                        <Button
                                            type="button" variant="ghost" size="sm"
                                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                            onClick={() => removeSection(index)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>

                                {/* Expanded Config */}
                                {isExpanded && (
                                    <div className="border-t px-4 py-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <SectionConfigPanel
                                            type={section.type}
                                            config={section.config}
                                            onChange={(config: Record<string, any>) => updateSectionConfig(index, config)}
                                        />
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* Add Section */}
                <div className="mt-4 flex justify-center">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button type="button" variant="outline" size="sm" className="gap-2">
                                <Plus className="h-4 w-4" />
                                Add Section
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center" className="w-56">
                            {availableTypes.map((type) => {
                                const meta = SECTION_META[type]
                                const IconComp = ICON_MAP[meta?.icon] || FileText
                                return (
                                    <DropdownMenuItem
                                        key={type}
                                        onClick={() => addSection(type)}
                                        className="gap-3"
                                    >
                                        <IconComp className="h-4 w-4 text-primary" />
                                        <div>
                                            <p className="font-medium text-sm">{meta?.label}</p>
                                            <p className="text-xs text-muted-foreground">{meta?.description}</p>
                                        </div>
                                    </DropdownMenuItem>
                                )
                            })}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </CardContent>
        </Card>
    )
}
