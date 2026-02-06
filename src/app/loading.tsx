import { LoadingOverlay } from "@/components/ui/loading-overlay";

export default function Loading() {
    // This component is automatically shown by Next.js during route transitions
    return (
        <LoadingOverlay isLoading={true} message="HangHut..." />
    );
}
