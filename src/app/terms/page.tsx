import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function TermsOfService() {
    return (
        <div className="container mx-auto py-12 px-4 max-w-4xl">
            <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>

            <div className="prose dark:prose-invert max-w-none space-y-6">
                <div className="p-4 bg-muted rounded-lg border">
                    <p className="font-semibold">Last Updated: February 1, 2026</p>
                </div>

                <section>
                    <h2 className="text-2xl font-bold mt-8 mb-4">1. Ticket Purchases</h2>
                    <p>
                        All ticket sales on HangHut are final unless the event is officially cancelled by the organizer.
                        HangHut acts as a platform for event organizers to sell tickets and does not set ticket prices or availability.
                    </p>
                </section>

                <section>
                    <h2 className="text-2xl font-bold mt-8 mb-4">2. Refund Policy</h2>
                    <p>
                        Refunds are processed according to the specific event organizer's policy.
                        If an event is cancelled, you will be notified via email and typically refunded automatically.
                        For other refund requests, please contact the event organizer directly.
                    </p>
                </section>

                <section>
                    <h2 className="text-2xl font-bold mt-8 mb-4">3. Privacy & Marketing</h2>
                    <p>
                        When you purchase a ticket, your basic information (name, email) is shared with the event organizer
                        for event-related communications. If you opt-in to receive marketing emails during checkout,
                        the organizer may send you promotional content. You can unsubscribe from these emails at any time
                        via the link provided in the email.
                    </p>
                </section>

                <section>
                    <h2 className="text-2xl font-bold mt-8 mb-4">4. Code of Conduct</h2>
                    <p>
                        Attendees are expected to behave respectfully at all events. Event organizers and venues reserve
                        the right to deny entry or remove attendees who violate their specific codes of conduct or local laws.
                    </p>
                </section>

                <div className="mt-12 pt-8 border-t flex flex-col items-center gap-4">
                    <p className="text-muted-foreground">Questions?</p>
                    <Button asChild variant="outline">
                        <Link href="/support">Contact Support</Link>
                    </Button>
                </div>
            </div>
        </div>
    )
}
