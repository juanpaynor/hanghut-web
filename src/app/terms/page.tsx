import Link from "next/link"
import { Button } from "@/components/ui/button"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Terms of Service - HangHut",
    description: "HangHut Terms of Service and Purchase Agreement.",
}

export default function TermsOfService() {
    return (
        <div className="container mx-auto py-12 px-4 max-w-3xl">
            <h1 className="text-3xl font-bold mb-2">Terms of Service: Purchase Agreement</h1>
            <p className="text-sm text-muted-foreground mb-10">Last Updated: May 8, 2026</p>

            <div className="space-y-10 text-sm leading-relaxed">

                {/* Section 1 */}
                <section>
                    <h2 className="text-lg font-semibold mb-4">1. Ticket Purchases &amp; Payments</h2>
                    <div className="space-y-4">
                        <div>
                            <h3 className="font-semibold mb-1">Finality of Sale</h3>
                            <p className="text-muted-foreground">
                                All ticket sales on HangHut are final. By completing a purchase, you acknowledge that tickets are non-refundable and non-exchangeable except as outlined in our Refund Policy.
                            </p>
                        </div>
                        <div>
                            <h3 className="font-semibold mb-1">Pricing &amp; Fees</h3>
                            <p className="text-muted-foreground">
                                Ticket prices are set by the Event Organizer. HangHut may apply a non-refundable service fee at checkout to cover platform maintenance and payment processing.
                            </p>
                        </div>
                        <div>
                            <h3 className="font-semibold mb-1">Booking Confirmation</h3>
                            <p className="text-muted-foreground">
                                A purchase is only considered complete once a confirmation email has been sent to your registered address.
                            </p>
                        </div>
                    </div>
                </section>

                <hr className="border-border" />

                {/* Section 2 */}
                <section>
                    <h2 className="text-lg font-semibold mb-4">2. Refund &amp; Cancellation Policy</h2>
                    <div className="space-y-4">
                        <div>
                            <h3 className="font-semibold mb-1">Cancelled Events</h3>
                            <p className="text-muted-foreground">
                                If an event is officially cancelled by the Organizer, you will receive a refund for the face value of the ticket. Please note that service fees are generally non-refundable.
                            </p>
                        </div>
                        <div>
                            <h3 className="font-semibold mb-1">Rescheduled Events</h3>
                            <p className="text-muted-foreground">
                                If an event is postponed, your ticket will typically remain valid for the new date. Refund eligibility for rescheduled events is at the sole discretion of the Event Organizer.
                            </p>
                        </div>
                        <div>
                            <h3 className="font-semibold mb-1">Third-Party Disputes</h3>
                            <p className="text-muted-foreground">
                                HangHut facilitates the transaction but is not responsible for the quality, safety, or delivery of the event. All refund requests not related to cancellation must be directed to the Event Organizer.
                            </p>
                        </div>
                    </div>
                </section>

                <hr className="border-border" />

                {/* Section 3 */}
                <section>
                    <h2 className="text-lg font-semibold mb-4">3. Data Sharing &amp; Privacy</h2>
                    <div className="space-y-4">
                        <div>
                            <h3 className="font-semibold mb-1">Organizer Access</h3>
                            <p className="text-muted-foreground">
                                To ensure a smooth event experience, your name and email address are shared with the Event Organizer for check-in and logistical updates.
                            </p>
                        </div>
                        <div>
                            <h3 className="font-semibold mb-1">Marketing Communications</h3>
                            <p className="text-muted-foreground">
                                You will only receive promotional content from Organizers if you explicitly &ldquo;Opt-In&rdquo; during checkout. You may revoke this consent at any time via the unsubscribe link in those specific emails.
                            </p>
                        </div>
                        <div>
                            <h3 className="font-semibold mb-1">Data Security</h3>
                            <p className="text-muted-foreground">
                                HangHut does not store full credit card details; all payments are processed via secure, PCI-compliant third-party gateways.
                            </p>
                        </div>
                    </div>
                </section>

                <hr className="border-border" />

                {/* Section 4 */}
                <section>
                    <h2 className="text-lg font-semibold mb-4">4. Entry &amp; Conduct</h2>
                    <div className="space-y-4">
                        <div>
                            <h3 className="font-semibold mb-1">Right of Admission</h3>
                            <p className="text-muted-foreground">
                                Purchase of a ticket does not guarantee entry. Venues and Organizers reserve the right to refuse admission or eject any person whose conduct is deemed disorderly or who fails to comply with local laws or venue-specific rules.
                            </p>
                        </div>
                        <div>
                            <h3 className="font-semibold mb-1">Verification</h3>
                            <p className="text-muted-foreground">
                                You may be required to present a valid government-issued ID matching the name on the ticket to gain entry.
                            </p>
                        </div>
                    </div>
                </section>

                <hr className="border-border" />

                {/* Section 5 */}
                <section>
                    <h2 className="text-lg font-semibold mb-4">5. Limitation of Liability</h2>
                    <p className="text-muted-foreground">
                        HangHut acts as a marketplace platform. We are not liable for any personal injury, property damage, or financial loss resulting from your attendance at an event or the actions of an Event Organizer.
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
