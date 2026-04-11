import { TemplateBuilderClient } from './template-builder-client'

export default function NewVenueTemplatePage() {
    return (
        <div className="h-[calc(100vh-2rem)] p-4">
            <TemplateBuilderClient templateId={null} />
        </div>
    )
}
