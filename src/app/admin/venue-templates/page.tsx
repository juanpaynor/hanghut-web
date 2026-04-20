import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, MapPin, Users, Eye, EyeOff, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TemplateActions } from './template-actions'

export default async function VenueTemplatesPage() {
    const supabase = await createClient()

    const { data: templates, error } = await supabase
        .from('venue_templates')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) {
        return (
            <div className="p-8">
                <p className="text-red-600">Error loading templates: {error.message}</p>
            </div>
        )
    }

    return (
        <div className="p-8 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Venue Templates</h1>
                    <p className="text-slate-500 mt-1">
                        Pre-built seat maps that organizers can use for their events
                    </p>
                </div>
                <Link href="/admin/venue-templates/new">
                    <Button className="bg-indigo-600 hover:bg-indigo-500">
                        <Plus className="w-4 h-4 mr-2" />
                        New Template
                    </Button>
                </Link>
            </div>

            {/* Templates Grid */}
            {templates && templates.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {templates.map((template) => (
                        <div
                            key={template.id}
                            className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all group"
                        >
                            {/* Preview Area */}
                            <div className="h-48 bg-slate-100 flex items-center justify-center relative">
                                {template.thumbnail_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={template.thumbnail_url}
                                        alt={template.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="text-slate-400 text-sm">
                                        <MapPin className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                        No preview
                                    </div>
                                )}
                                {/* Status badge */}
                                <div
                                    className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-medium ${
                                        template.is_published
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-amber-100 text-amber-700'
                                    }`}
                                >
                                    {template.is_published ? 'Published' : 'Draft'}
                                </div>
                            </div>

                            {/* Info */}
                            <div className="p-4">
                                <h3 className="font-semibold text-slate-900 text-lg">
                                    {template.name}
                                </h3>
                                <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
                                    <MapPin className="w-3.5 h-3.5" />
                                    {template.venue_name}
                                </p>

                                <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                                    {template.total_capacity && (
                                        <span className="flex items-center gap-1">
                                            <Users className="w-3.5 h-3.5" />
                                            {template.total_capacity.toLocaleString()} seats
                                        </span>
                                    )}
                                    {template.tags && template.tags.length > 0 && (
                                        <span>
                                            {template.tags.slice(0, 2).join(', ')}
                                        </span>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
                                    <Link
                                        href={`/admin/venue-templates/${template.id}/edit`}
                                        className="flex-1"
                                    >
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full text-xs"
                                        >
                                            Edit Template
                                        </Button>
                                    </Link>
                                    <TemplateActions
                                        templateId={template.id}
                                        isPublished={template.is_published}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
                    <MapPin className="w-12 h-12 mx-auto text-slate-700 mb-4" />
                    <h3 className="text-lg font-semibold text-slate-700">
                        No venue templates yet
                    </h3>
                    <p className="text-slate-500 mt-1 max-w-md mx-auto">
                        Create seat map templates for popular venues. Organizers will be able
                        to select these when configuring their events.
                    </p>
                    <Link href="/admin/venue-templates/new" className="mt-4 inline-block">
                        <Button className="bg-indigo-600 hover:bg-indigo-500">
                            <Plus className="w-4 h-4 mr-2" />
                            Create First Template
                        </Button>
                    </Link>
                </div>
            )}
        </div>
    )
}
