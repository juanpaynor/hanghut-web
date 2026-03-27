import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
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
                    <h1 className="font-headline font-bold text-4xl md:text-5xl">Privacy Policy</h1>
                    <p className="text-muted-foreground">Last Updated: March 25, 2026</p>
                </div>

                {/* Content */}
                <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8 text-foreground/90 font-light leading-relaxed">

                    {/* 1. Introduction */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">1. Introduction</h2>
                        <p>Welcome to HangHut (&ldquo;We&rdquo;, &ldquo;Our&rdquo;, or &ldquo;Us&rdquo;)! We respect your privacy and are committed to protecting your personal data. This Privacy Policy explains how we collect, use, and share your information when you use our mobile application and website (collectively, the &ldquo;App&rdquo;).</p>
                        <p className="mt-4">This Privacy Policy applies to personal data collected from individuals who use the HangHut Platform to browse, discover, register for, purchase tickets for, or attend events and activities (collectively, the &ldquo;Participants&rdquo;).</p>
                        <p className="mt-4">For purposes of this Privacy Policy, &ldquo;personal data&rdquo; refers to any information from which your identity is apparent or can reasonably be ascertained, in accordance with the Data Privacy Act of 2012.</p>
                    </section>

                    {/* 2. Information We Collect */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">2. Information We Collect</h2>
                        <p>We collect the following types of information to provide and improve our App.</p>

                        <h3 className="text-xl font-semibold mt-6 mb-2">2.1 Information You Provide to Us</h3>
                        <ul className="list-disc pl-5 space-y-2">
                            <li><strong>Identity Data:</strong> Name and Age/Date of Birth required to create your user profile and ensure age-appropriate interactions.</li>
                            <li><strong>Profile Data:</strong> Information you choose to add to your user profile, including Interests (Tags), Profile Photos, and Biography.</li>
                            <li><strong>User Content:</strong> Photos uploaded to galleries, events you create, and messages sent in group chats.</li>
                            <li><strong>Contact Data:</strong> Email address and other contact information you provide when creating an account or interacting with the Platform.</li>
                            <li><strong>Event Participation Data:</strong> Information relating to events you browse, register for, purchase tickets for, or attend. This may include ticket details, event confirmations, and participation history.</li>
                        </ul>

                        <h3 className="text-xl font-semibold mt-6 mb-2">2.2 Information We Collect Automatically</h3>
                        <ul className="list-disc pl-5 space-y-2">
                            <li>
                                <strong>Location Data (Precise):</strong> We collect your precise location data <strong>only available while you are using the App</strong> to:
                                <ul className="list-circle pl-5 mt-2 space-y-1 text-muted-foreground">
                                    <li>Show you the &ldquo;Live Activity Map&rdquo; (nearby events and dining tables).</li>
                                    <li>Verify your proximity to a venue for check-ins.</li>
                                    <li>Connect you with &ldquo;Open Crews&rdquo; in your immediate vicinity.</li>
                                </ul>
                                <span className="text-sm italic block mt-1">Note: You can revoke location permissions at any time in device settings.</span>
                            </li>
                            <li><strong>Device &amp; Usage Data:</strong> IP address, device model, and app usage patterns (e.g., screens visited, features used) to analyze compliance and improve stability.</li>
                        </ul>
                        <p className="mt-4">We may also collect technical information such as device identifiers, operating system version, browser type, session logs, crash reports, and performance metrics used to improve the Platform.</p>
                        <p className="mt-4">This information may be collected through cookies, log files, or similar technologies.</p>
                    </section>

                    {/* 3. How We Use Your Information */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">3. How We Use Your Information</h2>
                        <p>We use your data for the following legitimate purposes:</p>
                        <ul className="list-disc pl-5 space-y-2">
                            <li><strong>To Connect You:</strong> By displaying your Name, Age, Photo, and Interests to other users when you join a table or crew.</li>
                            <li><strong>To Provide Services:</strong> By showing relevant local dining/hangout activities using Mapbox and Google Places.</li>
                            <li><strong>To Facilitate Real-Time Interaction:</strong> Using Ably services to show live status updates and manage group chat sessions.</li>
                            <li><strong>To Maintain Safety:</strong> By using age data to filter content and prevent minors from accessing age-restricted features.</li>
                            <li><strong>To Manage Data:</strong> By storing your information securely on private servers hosted on AWS.</li>
                            <li><strong>To Facilitate Ticketing and Event Participation:</strong> By processing ticket purchases, generating confirmations, enabling event check-ins, and supporting event-related communications.</li>
                            <li><strong>To Provide Customer Support:</strong> By responding to user inquiries, resolving technical issues, and assisting with account or event-related concerns.</li>
                            <li><strong>To Maintain Platform Integrity and Prevent Fraud:</strong> By detecting, investigating, and preventing suspicious activity, ticket misuse, or violations of the HangHut Terms of Service.</li>
                            <li><strong>To Comply with Legal Obligations:</strong> Using personal data where required to comply with applicable laws, lawful government requests, or enforcement obligations.</li>
                        </ul>
                    </section>

                    {/* 4. Data Sharing and Disclosure */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">4. Data Sharing and Disclosure</h2>
                        <p className="font-medium text-foreground">We do NOT sell your personal data.</p>
                        <p className="mt-4">We share information only in &ldquo;Need-to-Know&rdquo; circumstances:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li><strong>To Other Users:</strong> Your Name, Age, Profile Photos, and Tags are visible to other users on the platform to facilitate social connections.</li>
                            <li>
                                <strong>To Service Providers:</strong> We use trusted third-party services to operate the App:
                                <ul className="list-circle pl-5 mt-2 space-y-1 text-muted-foreground">
                                    <li><strong>Amazon Web Services (AWS):</strong> For secure database hosting, authentication, and file storage on private servers.</li>
                                    <li><strong>Mapbox:</strong> For map and location display services.</li>
                                    <li><strong>Ably:</strong> For real-time messaging and status updates.</li>
                                    <li><strong>Google Places API:</strong> For venue search functionality.</li>
                                </ul>
                            </li>
                            <li><strong>Legal Requirements:</strong> If required by law or to protect the safety of our users.</li>
                        </ul>
                        <p className="mt-4">Where necessary to administer an Event, HangHut may share limited Participant information with the Host organizing the Event.</p>
                    </section>

                    {/* 5. Host Responsibility for Participant Data */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">5. Host Responsibility for Participant Data</h2>
                        <p>When a Participant registers for, purchases a ticket for, or otherwise participates in an Event through the Platform, certain personal data may be shared with the Host organizing that Event for legitimate event administration purposes, including attendee management, communications, ticket verification, and refunds.</p>
                        <p className="mt-4">Once such personal data has been shared with the Host for Event-related purposes, the Host may process that information independently in accordance with its own privacy practices and applicable laws. HangHut does not control and is not responsible for the Host&rsquo;s independent collection, use, storage, disclosure, or other processing of Participant personal data.</p>
                        <p className="mt-4">Participants acknowledge that Hosts may act as independent controllers of personal data for purposes related to the Events they organize, and that HangHut acts only as the platform facilitating the connection between Participants and Hosts.</p>
                        <p className="mt-4">Participants are encouraged to review any privacy notices or policies provided by the Host before registering for or attending an Event.</p>
                    </section>

                    {/* 6. Your Rights and Controls */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">6. Your Rights and Controls (Apple &amp; Google Compliance)</h2>
                        <p>You have control over your data.</p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li><strong>Access &amp; Correction:</strong> You can view and edit your Name, Profile Photos, and Tags directly in the App settings.</li>
                            <li><strong>Location Permissions:</strong> You can enable or disable location access at any time via your device&rsquo;s Settings.</li>
                            <li><strong>Account Deletion:</strong> You can request the deletion of your account and data directly within the App Settings {'>'} Delete Account. We process valid deletion requests by removing your personal data from our active databases.</li>
                        </ul>
                        <p className="mt-4">Deletion of your data from HangHut systems may not automatically delete personal data already shared with Event Hosts for legitimate event administration purposes.</p>
                    </section>

                    {/* 7. Data Retention */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">7. Data Retention</h2>
                        <p>We retain your personal information only as long as necessary to provide our services. Chat messages and event history are stored to provide context for your interactions but can be deleted upon account removal.</p>
                        <p className="mt-4">We may retain certain information for longer periods where required or permitted by law, including for fraud prevention, dispute resolution, legal compliance, or enforcement of agreements.</p>
                    </section>

                    {/* 8. Children's Privacy */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">8. Children&rsquo;s Privacy</h2>
                        <p>HangHut does not knowingly collect data from children under the age of 13. If we discover a child has provided us with personal information, we will delete it immediately.</p>
                    </section>

                    {/* 9. Security */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">9. Security</h2>
                        <p>We implement reasonable administrative, technical, and organizational safeguards designed to protect personal data against unauthorized access, disclosure, alteration, or destruction.</p>
                        <p className="mt-4">While we implement reasonable safeguards to protect personal data, electronic transmission and storage systems may still involve certain risks. Users are encouraged to exercise caution when deciding what personal information to share online.</p>
                    </section>

                    {/* 10. Third-Party Services and Links */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">10. Third-Party Services and Links</h2>
                        <p>The Platform may contain links to third-party websites or services that are not owned or operated by HangHut.</p>
                        <p className="mt-4">HangHut does not control and is not responsible for the privacy practices of such third-party services. The collection, use, and handling of your personal information by these third parties shall be subject to their respective privacy policies.</p>
                        <p className="mt-4">Users are encouraged to review the privacy policies of any third-party services they access through the Platform.</p>
                    </section>

                    {/* 11. Changes to This Privacy Policy */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">11. Changes to This Privacy Policy</h2>
                        <p>HangHut may update this Privacy Policy from time to time.</p>
                        <p className="mt-4">Updated versions will be posted on the Platform and will become effective upon posting unless otherwise stated. Continued use of the Platform after such updates constitutes acceptance of the revised Privacy Policy.</p>
                    </section>

                    {/* 12. Contact Us */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">12. Contact Us</h2>
                        <p>If you have questions about this Privacy Policy, please contact us at:</p>
                        <p className="mt-2">
                            <strong>Email:</strong> <a href="mailto:privacy@hanghut.com" className="text-primary hover:underline">privacy@hanghut.com</a><br />
                            <strong>Website:</strong> <a href="https://www.hanghut.com" className="text-primary hover:underline">www.hanghut.com</a>
                        </p>
                        <p className="mt-4">You may also contact us regarding requests to access, correct, or delete your personal data, subject to verification and applicable legal requirements.</p>
                    </section>

                </div>
            </div>
        </div>
    );
}
