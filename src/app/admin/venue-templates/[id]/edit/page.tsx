import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { TemplateBuilderClient } from '../../new/template-builder-client'
import type { CanvasData, SectionData } from '@/components/seat-map/types'

export default async function EditVenueTemplatePage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const supabase = await createClient()

    const { data: template, error } = await supabase
        .from('venue_templates')
        .select(`
            *,
            template_sections (*)
        `)
        .eq('id', id)
        .single()

    if (error || !template) {
        notFound()
    }

    // Reconstruct canvas data from the stored JSON
    // The canvas_data stores the full CanvasData JSON, so we use it directly
    const canvasData = template.canvas_data as unknown as CanvasData | null

    return (
        <div className="h-[calc(100vh-2rem)] p-4">
            <TemplateBuilderClient
                templateId={template.id}
                initialData={{
                    name: template.name,
                    venue_name: template.venue_name,
                    venue_address: template.venue_address || undefined,
                    canvas_data: canvasData || undefined,
                    tags: template.tags || [],
                    is_published: template.is_published,
                }}
            />
        </div>
    )
}
