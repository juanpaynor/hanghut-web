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
                    <h1 className="font-headline font-bold text-4xl md:text-5xl">Terms of Service</h1>
                    <p className="text-muted-foreground">Last Updated: January 5, 2026</p>
                </div>

                {/* Content */}
                <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8 text-foreground/90 font-light leading-relaxed">

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">1. Acceptance of Terms</h2>
                        <p>By accessing, downloading, or using the HangHut mobile application, website, or any related services, collectively the App, you agree to be legally bound by these Terms of Service. If you do not agree to all Terms, you must not access or use the App.</p>
                        <p className="mt-4">Continued use of the App constitutes ongoing acceptance of these Terms, including any future updates.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">2. Eligibility and Age Requirement</h2>
                        <p>You must be at least 18 years old, or the age of legal majority in your jurisdiction, whichever is higher, to use the App.</p>
                        <p className="mt-4">By using HangHut, you represent and warrant that:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>You meet the minimum legal age requirement</li>
                            <li>You are legally permitted to participate in real-world social activities</li>
                            <li>You are not prohibited by law from using location-based or social services</li>
                        </ul>
                        <p className="mt-4">HangHut does not verify user age or identity and is not responsible for false representations. Any use by underage individuals is strictly unauthorized.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">3. Account Registration and Security</h2>
                        <p>You are solely responsible for:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>All activity conducted through your account</li>
                            <li>Maintaining the confidentiality of login credentials</li>
                            <li>Any loss or damage resulting from unauthorized access</li>
                        </ul>
                        <p className="mt-4">HangHut is not liable for account misuse, compromised credentials, or unauthorized access, regardless of cause.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">4. Nature of the Platform</h2>
                        <p>HangHut is a technology platform only. HangHut does not:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>Organize, host, supervise, or endorse events</li>
                            <li>Verify users, events, locations, or activities</li>
                            <li>Provide security, chaperoning, or monitoring services</li>
                        </ul>
                        <p className="mt-4">All events, meetups, and interactions are user-initiated and user-controlled.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">5. User Conduct and Community Rules</h2>
                        <p>You agree not to engage in any conduct that is unlawful, harmful, deceptive, or disruptive.</p>
                        <p className="mt-4">Prohibited conduct includes, but is not limited to:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>Harassment, threats, abuse, or intimidation</li>
                            <li>Hate speech, sexual content, or illegal material</li>
                            <li>Stalking, tracking, or exploiting other users</li>
                            <li>Creating fake events or misleading activity listings</li>
                            <li>Impersonation or misrepresentation of identity or intent</li>
                            <li>Using the App for commercial solicitation without authorization</li>
                        </ul>
                        <p className="mt-4">HangHut may remove content or restrict accounts at its sole discretion, without notice or explanation.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">6. Real-World Interaction and Safety Disclaimer</h2>
                        <p>You acknowledge that:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>HangHut does not control offline behavior</li>
                            <li>Interactions with other users carry inherent risks</li>
                            <li>You assume full responsibility for your safety and decisions</li>
                        </ul>
                        <p className="mt-4">HangHut does not conduct background checks, criminal screenings, or identity verification.</p>
                        <p className="mt-4 font-medium text-foreground">You agree that any injury, loss, damage, or incident occurring during or after an in-person interaction is your sole responsibility.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">7. Location Services and Risk Acknowledgment</h2>
                        <p>The App may collect and display real-time or approximate location data.</p>
                        <p className="mt-4">By enabling location features, you expressly consent to:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>Collection and processing of location data</li>
                            <li>Display of your location to other users</li>
                            <li>Associated risks of location sharing</li>
                        </ul>
                        <p className="mt-4">You acknowledge that location-based services may expose you to danger, and HangHut bears no responsibility for misuse, tracking, or harm related to location data.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">8. User Content</h2>
                        <p>You retain ownership of content you submit. By submitting content, you grant HangHut a worldwide, non-exclusive, perpetual, royalty-free, sublicensable license to use, store, modify, display, distribute, and promote such content in connection with the App.</p>
                        <p className="mt-4">HangHut may remove or restrict content at any time, for any reason, without liability.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">9. No Professional or Safety Advice</h2>
                        <p>Any tips, suggestions, or recommendations provided by HangHut are for general informational purposes only and do not constitute professional, legal, medical, or safety advice.</p>
                        <p className="mt-4">You remain solely responsible for assessing risks.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">10. Disclaimer of Warranties</h2>
                        <p className="uppercase font-medium">THE APP IS PROVIDED AS IS AND AS AVAILABLE. HANGHUT DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF SAFETY, ACCURACY, RELIABILITY, AND FITNESS FOR A PARTICULAR PURPOSE.</p>
                        <p className="mt-4 uppercase">HANGHUT DOES NOT GUARANTEE:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>Event legitimacy</li>
                            <li>User behavior</li>
                            <li>Safety outcomes</li>
                            <li>Availability or uninterrupted service</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">11. Limitation of Liability</h2>
                        <p className="uppercase font-medium">TO THE MAXIMUM EXTENT PERMITTED BY LAW, HANGHUT SHALL NOT BE LIABLE FOR ANY DAMAGES OF ANY KIND, INCLUDING PERSONAL INJURY, DEATH, PROPERTY DAMAGE, LOST PROFITS, DATA LOSS, OR EMOTIONAL DISTRESS, ARISING FROM OR RELATED TO:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>Use of the App</li>
                            <li>Offline interactions</li>
                            <li>Events or activities</li>
                            <li>Location sharing</li>
                        </ul>
                        <p className="mt-4 uppercase font-bold text-red-500">USE OF THE APP IS ENTIRELY AT YOUR OWN RISK.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">12. Indemnification</h2>
                        <p>You agree to indemnify and hold harmless HangHut and its affiliates from any claims, liabilities, damages, losses, or expenses arising from:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li>Your use of the App</li>
                            <li>Your interactions with other users</li>
                            <li>Your violation of these Terms</li>
                            <li>Any offline incidents involving you</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">13. Suspension and Termination</h2>
                        <p>HangHut may suspend or terminate your account at any time, with or without notice, for any reason, including suspected risk to the community.</p>
                        <p className="mt-4">No refunds, compensation, or reinstatement is guaranteed.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">14. Modifications to Terms</h2>
                        <p>HangHut may update these Terms at any time. Continued use of the App after updates constitutes acceptance of the revised Terms.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">15. Governing Law and Jurisdiction</h2>
                        <p>These Terms shall be governed by and construed in accordance with the laws of the Philippines, without regard to conflict of law principles. Any disputes shall be resolved exclusively in Philippine courts.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">16. Contact</h2>
                        <p>Questions or concerns may be directed to <a href="mailto:support@hanghut.com" className="text-primary hover:underline">support@hanghut.com</a></p>
                    </section>

                </div>
            </div>
        </div>
    );
}
