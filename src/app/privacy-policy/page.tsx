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
                    <h1 className="font-headline font-bold text-4xl md:text-5xl">Privacy Policy</h1>
                    <p className="text-muted-foreground">Last Updated: January 4, 2026</p>
                </div>

                {/* Content */}
                <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8 text-foreground/90 font-light leading-relaxed">

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">1. Introduction</h2>
                        <p>Welcome to HangHut ("we," "our," or "us"). We respect your privacy and are committed to protecting your personal data. This Privacy Policy explains how we collect, use, and share your information when you use our mobile application and website (collectively, the "App").</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">2. Information We Collect</h2>
                        <p>We collect the following types of information to provide and improve our App:</p>

                        <h3 className="text-xl font-semibold mt-6 mb-2">2.1 Information You Provide to Us</h3>
                        <ul className="list-disc pl-5 space-y-2">
                            <li><strong>Identity Data:</strong> Name and Age/Date of Birth. Required to create your user profile and ensure age-appropriate interactions (13+ or 18+ depending on jurisdiction).</li>
                            <li><strong>Profile Data:</strong> Information you choose to add to "Profiles That Matter", including Interests (Tags), Profile Photos, and Biography.</li>
                            <li><strong>User Content:</strong> Photos uploaded to galleries, events you create, and messages sent in group chats.</li>
                        </ul>

                        <h3 className="text-xl font-semibold mt-6 mb-2">2.2 Information We Collect Automatically</h3>
                        <ul className="list-disc pl-5 space-y-2">
                            <li>
                                <strong>Location Data (Precise):</strong> We collect your precise location data <strong>only available while you are using the App</strong> to:
                                <ul className="list-circle pl-5 mt-2 space-y-1 text-muted-foreground">
                                    <li>Show you the "Live Activity Map" (nearby events and dining tables).</li>
                                    <li>Verify your proximity to a venue for check-ins.</li>
                                    <li>Connect you with "Open Crews" in your immediate vicinity.</li>
                                </ul>
                                <span className="text-sm italic block mt-1">Note: You can revoke location permissions at any time in device settings.</span>
                            </li>
                            <li><strong>Device & Usage Data:</strong> IP address, device model, and app usage patterns (e.g., screens visited, features used) to analyze compliance and improve stability.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">3. How We Use Your Information</h2>
                        <p>We use your data for the following legitimate purposes:</p>
                        <ul className="list-disc pl-5 space-y-2">
                            <li><strong>To Connect You:</strong> Displaying your Name, Age, Photo, and Interests to other users when you join a table or crew.</li>
                            <li><strong>To Provide Services:</strong> Showing relevant local dining/hangout activities using Mapbox and Google Places.</li>
                            <li><strong>To Facilitate Real-Time Interaction:</strong> Using Ably services to show live status updates and manage group chat sessions.</li>
                            <li><strong>To Maintain Safety:</strong> Using Age data to filter content and prevent minors from accessing age-restricted features.</li>
                            <li><strong>To Manage Data:</strong> Storing your information securely using Supabase.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">4. Data Sharing and Disclosure</h2>
                        <p>We do NOT sell your personal data. We share information only in "Need-to-Know" circumstances:</p>
                        <ul className="list-disc pl-5 space-y-2">
                            <li><strong>Other Users:</strong> Your Name, Age, Profile Photos, and Tags are visible to other users on the platform to facilitate social connections.</li>
                            <li>
                                <strong>Service Providers:</strong> We use trusted third-party services to operate the App:
                                <ul className="list-circle pl-5 mt-2 space-y-1 text-muted-foreground">
                                    <li><strong>Supabase:</strong> For secure database hosting, authentication, and file storage.</li>
                                    <li><strong>Mapbox:</strong> To display maps and location imagery.</li>
                                    <li><strong>Ably:</strong> For real-time messaging and status updates.</li>
                                    <li><strong>Google Places API:</strong> For venue search functionality.</li>
                                </ul>
                            </li>
                            <li><strong>Legal Requirements:</strong> If required by law or to protect the safety of our users.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">5. Your Rights and Controls (Apple & Google Compliance)</h2>
                        <p>You have control over your data:</p>
                        <ul className="list-disc pl-5 space-y-2">
                            <li><strong>Access & Correction:</strong> You can view and edit your Name, Profile Photos, and Tags directly in the App settings.</li>
                            <li><strong>Location Permissions:</strong> You can enable or disable location access at any time via your device's Settings.</li>
                            <li><strong>Account Deletion:</strong> You can request the deletion of your account and data directly within the App Settings {'>'} Delete Account. We process valid deletion requests by removing your personal data from our active databases.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">6. Data Retention</h2>
                        <p>We retain your personal information only as long as necessary to provide our services. Chat messages and event history are stored to provide context for your interactions but can be deleted upon account removal.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">7. Children's Privacy</h2>
                        <p>HangHut does not knowingly collect data from children under the age of 13. If we discover a child has provided us with personal information, we will delete it immediately.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">8. Contact Us</h2>
                        <p>If you have questions about this Privacy Policy, please contact us at:</p>
                        <p className="mt-2">
                            <strong>Email:</strong> privacy@hanghut.com<br />
                            <strong>Website:</strong> www.hanghut.com
                        </p>
                    </section>

                    <section className="bg-muted p-6 rounded-xl mt-12 border border-border/50">
                        <h2 className="text-lg font-bold text-foreground mb-2">Note to App Reviewers (Apple/Google):</h2>
                        <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
                            <li><strong>Location:</strong> This app uses location services to facilitate real-time physical meetups ("Live Activity Map"). Location is core to the app's functionality and is used to display nearby "Dining Tables" and "Hangouts".</li>
                            <li><strong>Account Deletion:</strong> A clear "Delete Account" button is available in the Settings screen (accessible via Profile), allowing users to initiate the deletion of their data.</li>
                        </ul>
                    </section>

                </div>
            </div>
        </div>
    );
}
