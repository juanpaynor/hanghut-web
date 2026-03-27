import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function TermsOfService() {
    return (
        <div className="min-h-screen bg-background py-10 px-4 md:px-8">
            <div className="max-w-3xl mx-auto space-y-8">

                {/* Navigation */}
                <Link href="/" className="inline-flex items-center text-muted-foreground hover:text-primary transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Home
                </Link>

                {/* Header */}
                <div className="space-y-2 border-b border-border pb-8">
                    <p className="text-sm font-medium text-primary uppercase tracking-wider">HangHut Inc.</p>
                    <h1 className="font-headline font-bold text-4xl md:text-5xl">Terms of Service for Hosts / Organizers</h1>
                    <p className="text-muted-foreground">Last Updated: March 25, 2026</p>
                </div>

                {/* Content */}
                <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8 text-foreground/90 font-light leading-relaxed">

                    {/* 1. Acceptance of Terms */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">1. Acceptance of Terms</h2>
                        <p>By accessing, downloading, or using the HangHut mobile application, website, or any related services (collectively, the &ldquo;App&rdquo;), you agree to be legally bound by these Terms of Service. If you do not agree to all Terms, you must not access or use the App.</p>
                        <p className="mt-4">Continued use of the App shall constitute ongoing acceptance of these Terms, including any future updates.</p>
                        <p className="mt-4">These Terms of Service (&ldquo;Terms&rdquo;) shall govern the access to and use of the App by individuals or entities that create, organize, promote, or sell tickets for Events through the Platform (collectively, the &ldquo;Hosts&rdquo; or &ldquo;Organizers&rdquo;).</p>
                        <p className="mt-4">These Terms shall be read together with the HangHut Privacy Policy, Community Guidelines, Host Policies or any other Operational Guidelines issued by HangHut relating to payments, ticketing, or platform features.</p>
                        <p className="mt-4">By using the App, you acknowledge that you are entering into a binding agreement with HangHut governing your access to and use of the Platform and its related services.</p>
                        <p className="mt-4">By registering as a Host, creating an Event listing, offering Tickets, or otherwise using the Platform&rsquo;s hosting or event management tools, you acknowledge that you are entering into a binding agreement with HangHut governing your access to and use of the Platform and its related services and agree to be legally bound by these Terms.</p>
                        <p className="mt-4 font-medium text-foreground">If you do not agree to these Terms, you must not create Events or use HangHut&rsquo;s hosting tools.</p>
                    </section>

                    {/* 2. Definitions */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">2. Definitions</h2>
                        <p>For purposes of these Terms, the following definitions shall apply:</p>
                        <ul className="list-disc pl-5 space-y-3 mt-4">
                            <li><strong>&ldquo;Event&rdquo; or &ldquo;Activity&rdquo;</strong> refers to any real-world gathering, experience, program, class, trip, nightlife activity, or similar activity created, organized, or offered by a Host and listed on the HangHut Platform.</li>
                            <li><strong>&ldquo;Host&rdquo; or &ldquo;Organizer&rdquo;</strong> refers to any individual or juridical entity that creates, organizes, manages, or offers an Event through the HangHut Platform.</li>
                            <li><strong>&ldquo;Merchant of Record&rdquo;</strong> refers to the entity legally responsible for the sale of Tickets, collection of payments, issuance of refunds, and handling of chargebacks. For avoidance of doubt, HangHut shall not be considered as the Merchant of Record under this Agreement.</li>
                            <li><strong>&ldquo;Participant&rdquo;</strong> refers to any user who browses, registers for, purchases, receives, or uses a Ticket for an Event or attends an Event.</li>
                            <li><strong>&ldquo;Ticket&rdquo;</strong> refers to any paid or free access credential, whether digital or physical, issued through the Platform granting a Participant access to an Event.</li>
                            <li><strong>&ldquo;Convenience Fee&rdquo;</strong> refers to the service fee charged to Participants for Tickets issued through the Platform.</li>
                            <li><strong>&ldquo;Services&rdquo;</strong> refers to the discovery, listing, ticketing, payment facilitation, and related platform functionalities made available by HangHut through the Platform.</li>
                            <li><strong>&ldquo;Host Content&rdquo;</strong> refers to any information, event descriptions, images, promotional materials, videos, or other materials submitted by a Host to promote or describe an Event.</li>
                        </ul>
                    </section>

                    {/* 3. Eligibility and Authority */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">3. Eligibility and Authority</h2>
                        <p>You represent and warrant that:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>You are at least eighteen (18) years old or the age of legal majority in your jurisdiction;</li>
                            <li>If you are acting on behalf of a business, organization, or group, you have the authority to legally bind that entity;</li>
                            <li>You have the legal right to organize and host the Event listed; and</li>
                            <li>You are not prohibited by law from organizing events, receiving payments, or conducting business activities.</li>
                        </ul>
                        <p className="mt-4">HangHut does not verify the identity, licensing status, or legal authority of Hosts and shall not be responsible for misrepresentations made by Hosts.</p>
                    </section>

                    {/* 4. Account Registration and Security */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">4. Account Registration and Security</h2>
                        <p>Hosts may be required to create a HangHut account in order to list Events.</p>
                        <p className="mt-4">You are responsible for:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>All activity conducted under your account;</li>
                            <li>Maintaining the confidentiality of login credentials; and</li>
                            <li>Providing accurate and updated account information.</li>
                        </ul>
                        <p className="mt-4">Hosts must immediately notify HangHut of any unauthorized access to your account.</p>
                        <p className="mt-4">HangHut may suspend or terminate accounts that contain false information, create safety risks, violate laws, or breach these Terms.</p>
                    </section>

                    {/* 5. Nature of the Platform */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">5. Nature of the Platform</h2>
                        <p className="font-medium text-foreground">HangHut&rsquo;s Role.</p>
                        <p className="mt-2">HangHut operates solely as a technology platform that allows Hosts to list, promote, and manage Events and allows Participants to discover and purchase tickets. HangHut does not:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>Organize, host, supervise, or endorse events;</li>
                            <li>Verify users, events, locations, or activities;</li>
                            <li>Provide security, chaperoning, or monitoring services; or</li>
                            <li>Control or direct interactions between users.</li>
                        </ul>
                        <p className="mt-4">All events, meetups, and interactions are user-initiated and user-controlled.</p>

                        <p className="font-medium text-foreground mt-6">Host Responsibility.</p>
                        <p className="mt-2">The Host is solely responsible for:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>Organizing and conducting the Event;</li>
                            <li>Event safety and logistics;</li>
                            <li>Venue arrangements;</li>
                            <li>Staff, security, and operations;</li>
                            <li>Compliance with laws and regulations; and</li>
                            <li>Accuracy of Event information.</li>
                        </ul>
                    </section>

                    {/* 6. Event Listings and Host Responsibilities */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">6. Event Listings and Host Responsibilities</h2>
                        <p>Hosts must ensure that Event listings are accurate, not misleading, and updated if Event details change. Event descriptions must clearly disclose:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>Date and time;</li>
                            <li>Location;</li>
                            <li>Ticket price;</li>
                            <li>Participation requirements;</li>
                            <li>Age restrictions; and</li>
                            <li>Refund policies.</li>
                        </ul>
                        <p className="mt-4">Hosts may not create misleading, fraudulent, or deceptive Event listings.</p>
                        <p className="mt-4">HangHut may remove Events that violate these Terms.</p>
                    </section>

                    {/* 7. Licenses, Permits, and Legal Compliance */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">7. Licenses, Permits, and Legal Compliance</h2>
                        <p>Hosts represent and warrant that they will obtain and maintain all necessary licenses, permits, approvals, and authorizations required for their Events.</p>
                        <p className="mt-4">These may include, but are not limited to:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>Business permits;</li>
                            <li>Local government approvals;</li>
                            <li>Venue permits;</li>
                            <li>Safety inspections;</li>
                            <li>Alcohol permits;</li>
                            <li>Public event licenses; and</li>
                            <li>Insurance coverage, where applicable.</li>
                        </ul>
                        <p className="mt-4">Hosts shall be responsible for ensuring their Events comply with all applicable local, national, and regulatory laws.</p>
                        <p className="mt-4">HangHut may request documentation demonstrating compliance.</p>
                    </section>

                    {/* 8. Payments and Ticketing */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">8. Payments and Ticketing</h2>
                        <p>Hosts may offer free or paid Tickets through the Platform.</p>
                        <p className="mt-4">Ticket payments may be processed through third-party payment providers integrated with HangHut.</p>
                        <p className="mt-4">HangHut shall not be responsible for:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>Payment processor errors;</li>
                            <li>Payment failures;</li>
                            <li>Banking issues;</li>
                            <li>Chargebacks; and</li>
                            <li>Delayed fund transfers.</li>
                        </ul>
                        <p className="mt-4">Unless otherwise stated, the Host is the Merchant of Record and is responsible for ticket transactions.</p>
                        <p className="mt-4">Hosts shall comply with payment provider rules and applicable financial regulations.</p>
                    </section>

                    {/* 9. Refunds, Cancellations, and Event Changes */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">9. Refunds, Cancellations, and Event Changes</h2>
                        <p>Hosts are responsible for establishing and clearly disclosing their refund and cancellation policies.</p>
                        <p className="mt-4">The Host shall be responsible for notifying Participants and processing refunds where applicable if an Event is:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>Cancelled;</li>
                            <li>Postponed;</li>
                            <li>Rescheduled; or</li>
                            <li>Materially altered.</li>
                        </ul>
                        <p className="mt-4">HangHut may assist in facilitating refunds but is not financially responsible for refunds owed by Hosts.</p>
                        <p className="mt-4">Convenience Fees charged by HangHut may be non-refundable unless required by law.</p>
                    </section>

                    {/* 10. Community Rules */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">10. Community Rules</h2>
                        <p>You agree not to engage in prohibited unlawful, harmful, deceptive, or disruptive conduct.</p>
                        <p className="mt-4">Prohibited conduct includes an act that:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>Harasses or threatens Participants;</li>
                            <li>Promotes illegal activity;</li>
                            <li>Misrepresents Events;</li>
                            <li>Violates laws or safety standards; and</li>
                            <li>Creates fraudulent ticket sales.</li>
                        </ul>
                        <p className="mt-4">Hosts must also ensure that their Events comply with HangHut&rsquo;s Community Guidelines.</p>
                        <p className="mt-4">HangHut may remove Event listings or suspend Hosts who violate platform policies.</p>
                    </section>

                    {/* 11. Host Content and Intellectual Property */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">11. Host Content and Intellectual Property</h2>
                        <p>Hosts retain ownership of their Host Content.</p>
                        <p className="mt-4">By submitting Host Content to HangHut, you grant HangHut a worldwide, non-exclusive, perpetual, royalty-free, sublicensable license to use, store, modify, display, distribute, and promote such content in connection with the App.</p>
                        <p className="mt-4">HangHut may use Event images, descriptions, and branding for marketing and promotional purposes.</p>
                        <p className="mt-4">Hosts represent that their content does not infringe the rights of any third party.</p>
                    </section>

                    {/* 12. Data and Participant Information */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">12. Data and Participant Information</h2>
                        <p>Hosts may receive limited Participant information necessary for Event management.</p>
                        <p className="mt-4">Hosts agree to:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>Use Participant data solely for Event-related purposes;</li>
                            <li>Protect personal data in compliance with applicable privacy laws; and</li>
                            <li>Not sell or misuse Participant data.</li>
                        </ul>
                        <p className="mt-4">Misuse of Participant data may result in account termination.</p>
                    </section>

                    {/* 13. Disclaimer of Warranties */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">13. Disclaimer of Warranties</h2>
                        <p>The App is provided &ldquo;As Is&rdquo; and &ldquo;As Available.&rdquo;</p>
                        <p className="mt-4">HangHut does not guarantee:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>Event legitimacy;</li>
                            <li>User behavior;</li>
                            <li>Safety outcomes;</li>
                            <li>Availability or uninterrupted service;</li>
                            <li>Event success;</li>
                            <li>Ticket sales volume;</li>
                            <li>Platform uptime;</li>
                            <li>Marketing performance; or</li>
                            <li>Participant attendance.</li>
                        </ul>
                        <p className="mt-4">HangHut further disclaims warranties regarding the quality, legality, or success of any Event or information provided by Hosts or other users.</p>
                    </section>

                    {/* 14. Limitation of Liability */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">14. Limitation of Liability</h2>
                        <p>To the maximum extent permitted by law, HangHut shall not be liable for damages arising from:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>Event cancellations;</li>
                            <li>Venue issues;</li>
                            <li>Participant injuries;</li>
                            <li>Business losses;</li>
                            <li>Loss of ticket revenue;</li>
                            <li>Payment processor failures; or</li>
                            <li>Marketing performance.</li>
                        </ul>
                        <p className="mt-4 font-medium text-foreground">HangHut&rsquo;s total liability to a Host shall not exceed the total Convenience Fees paid to HangHut within the three (3) months preceding the claim.</p>
                    </section>

                    {/* 15. Indemnification */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">15. Indemnification</h2>
                        <p>Hosts agree to indemnify and hold harmless HangHut from claims arising out of:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>Event organization or management;</li>
                            <li>Injuries or incidents at Events;</li>
                            <li>Violations of law;</li>
                            <li>Ticket disputes;</li>
                            <li>Host misconduct; or</li>
                            <li>Intellectual property infringement.</li>
                        </ul>
                        <p className="mt-4">This shall include legal costs and damages arising from such claims.</p>
                    </section>

                    {/* 16. Release */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">16. Release</h2>
                        <p>Hosts release HangHut from disputes between:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>Hosts and Participants;</li>
                            <li>Hosts and venues; and</li>
                            <li>Hosts and service providers.</li>
                        </ul>
                        <p className="mt-4">HangHut shall not be responsible for disputes arising from Event operations.</p>
                    </section>

                    {/* 17. Suspension and Termination */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">17. Suspension and Termination</h2>
                        <p>HangHut may suspend or terminate a Host account if:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>The Host violates these Terms;</li>
                            <li>The Event presents safety risks;</li>
                            <li>Fraud or abuse occurs; or</li>
                            <li>Legal or regulatory issues arise.</li>
                        </ul>
                        <p className="mt-4">HangHut may remove Event listings at its discretion.</p>
                    </section>

                    {/* 18. Modifications to Terms */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">18. Modifications to Terms</h2>
                        <p>HangHut may update these Terms at any time.</p>
                        <p className="mt-4">Material changes may be communicated through updates in the App, email notification, or other reasonable notice methods.</p>
                    </section>

                    {/* 19. Third-Party Services */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">19. Third-Party Services</h2>
                        <p>The Platform may rely on third-party services including payment processors, mapping services, communication tools, or venue integrations. HangHut does not control and shall not be responsible for the performance, availability, security, or actions of such third-party services.</p>
                    </section>

                    {/* 20. Intellectual Property */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">20. Intellectual Property</h2>
                        <p>The Platform, including its software, design, trademarks, and content, is owned by HangHut and protected under applicable intellectual property laws. Users may not reproduce or exploit the Platform without authorization.</p>
                    </section>

                    {/* 21. Notices */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">21. Notices</h2>
                        <p>HangHut may provide notices by email, in-app notification, or posting on the Platform. Users are responsible for maintaining accurate contact information.</p>
                    </section>

                    {/* 22. Governing Law and Jurisdiction */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">22. Governing Law and Jurisdiction</h2>
                        <p>These Terms shall be governed by Philippine law.</p>
                        <p className="mt-4">Subject to applicable law, any dispute arising from these Terms or the use of the Platform shall be brought exclusively before the proper courts of Makati City, Philippines.</p>
                    </section>

                    {/* 23. Miscellaneous */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">23. Miscellaneous</h2>
                        <p>If any provision of these Terms is held invalid or unenforceable, the remaining provisions shall remain in effect.</p>
                        <p className="mt-4">These Terms constitute the entire agreement between HangHut and Hosts regarding the use of the Platform.</p>
                    </section>

                    {/* Contact */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">Contact</h2>
                        <p>Questions or concerns may be directed to <a href="mailto:support@hanghut.com" className="text-primary hover:underline">support@hanghut.com</a></p>
                    </section>

                </div>
            </div>
        </div>
    );
}
