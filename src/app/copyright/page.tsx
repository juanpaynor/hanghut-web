import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Copyright Policy | HangHut",
    description: "HangHut's copyright policy, intellectual property standards, and DMCA takedown procedures.",
};

export default function CopyrightPage() {
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
                    <h1 className="font-headline font-bold text-4xl md:text-5xl">Copyright Policy</h1>
                    <p className="text-muted-foreground">Last Updated: April 28, 2026</p>
                </div>

                <div className="prose prose-zinc dark:prose-invert max-w-none space-y-10 text-foreground/90 font-light leading-relaxed">

                    {/* 1. Ownership */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">1. Ownership of Content</h2>
                        <p>
                            The HangHut platform, including its mobile applications, website, logos, trademarks, software, design, text, graphics, and all other content created or provided by HangHut (&ldquo;HangHut Content&rdquo;), is owned by or licensed to HangHut Inc. and is protected by copyright, trademark, and other intellectual property laws of the Republic of the Philippines and applicable international treaties.
                        </p>
                        <p className="mt-4">
                            You may not reproduce, distribute, modify, create derivative works of, publicly display, publicly perform, republish, download, store, or transmit any HangHut Content without our prior written consent, except as permitted by these terms.
                        </p>
                    </section>

                    {/* 2. User Content */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">2. User-Generated Content</h2>
                        <p>
                            When you upload, post, or share content on HangHut — including photos, event listings, posts, comments, or messages (&ldquo;User Content&rdquo;) — you retain ownership of that content. However, by submitting User Content to HangHut, you grant us a non-exclusive, royalty-free, worldwide, sublicensable, and transferable license to use, reproduce, distribute, prepare derivative works of, display, and perform that content in connection with operating and promoting the HangHut platform.
                        </p>
                        <p className="mt-4">
                            You represent and warrant that:
                        </p>
                        <ul className="list-disc pl-5 space-y-2 mt-4">
                            <li>You own or have the necessary rights to the content you post.</li>
                            <li>Your content does not infringe the intellectual property, privacy, or other rights of any third party.</li>
                            <li>You have obtained all necessary permissions from individuals featured in your content.</li>
                        </ul>
                    </section>

                    {/* 3. Prohibited Conduct */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">3. Prohibited Content</h2>
                        <p>You may not upload, post, or share content on HangHut that:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-4">
                            <li>Infringes any copyright, trademark, patent, trade secret, or other intellectual property right of any person or entity.</li>
                            <li>Contains music, video, images, or other media you do not have the rights to share.</li>
                            <li>Reproduces or distributes copyrighted works (e.g., songs, films, software) without authorization.</li>
                            <li>Violates any applicable law regarding intellectual property.</li>
                        </ul>
                        <p className="mt-4">
                            Users who repeatedly infringe third-party copyrights may have their accounts suspended or permanently terminated.
                        </p>
                    </section>

                    {/* 4. DMCA */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">4. DMCA Takedown Procedure</h2>
                        <p>
                            If you believe that content on HangHut infringes your copyright, you may submit a takedown notice to us. Your notice must include:
                        </p>
                        <ol className="list-decimal pl-5 space-y-2 mt-4">
                            <li>A description of the copyrighted work you claim has been infringed.</li>
                            <li>A description of the material you believe is infringing, with enough detail for us to locate it (e.g., a URL or screenshot).</li>
                            <li>Your contact information — name, address, email address, and phone number.</li>
                            <li>A statement that you have a good-faith belief that the use of the material is not authorized by the copyright owner, its agent, or the law.</li>
                            <li>A statement that the information in your notice is accurate, and under penalty of perjury, that you are the copyright owner or authorized to act on the owner&apos;s behalf.</li>
                            <li>Your physical or electronic signature.</li>
                        </ol>
                        <div className="bg-muted/50 border border-border rounded-lg p-5 mt-6">
                            <p className="font-medium text-foreground mb-1">Send DMCA notices to:</p>
                            <p className="text-foreground/80">
                                <strong>Email:</strong>{" "}
                                <a href="mailto:contact@hanghut.com" className="text-primary hover:underline">
                                    contact@hanghut.com
                                </a>
                            </p>
                            <p className="text-foreground/80 mt-1"><strong>Subject line:</strong> DMCA Takedown Request</p>
                            <p className="text-foreground/80 mt-1"><strong>Organization:</strong> HangHut Inc.</p>
                        </div>
                        <p className="mt-4 text-sm text-muted-foreground">
                            We will review all valid notices and respond promptly. Please note that submitting a false or fraudulent DMCA notice may result in legal liability.
                        </p>
                    </section>

                    {/* 5. Counter-Notice */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">5. Counter-Notice</h2>
                        <p>
                            If you believe your content was removed in error, you may submit a counter-notice to{" "}
                            <a href="mailto:contact@hanghut.com" className="text-primary hover:underline">
                                contact@hanghut.com
                            </a>{" "}
                            with the subject line <strong>&ldquo;DMCA Counter-Notice&rdquo;</strong>. Your counter-notice must include:
                        </p>
                        <ol className="list-decimal pl-5 space-y-2 mt-4">
                            <li>Identification of the content that was removed and its location before removal.</li>
                            <li>A statement under penalty of perjury that you have a good-faith belief the content was removed by mistake or misidentification.</li>
                            <li>Your name, address, phone number, and email address.</li>
                            <li>Your physical or electronic signature.</li>
                        </ol>
                    </section>

                    {/* 6. Trademarks */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">6. Trademarks</h2>
                        <p>
                            &ldquo;HangHut&rdquo; and the HangHut logo are trademarks of HangHut Inc. You may not use our trademarks without our prior written permission. All other trademarks, service marks, and logos referenced on our platform are the property of their respective owners.
                        </p>
                    </section>

                    {/* 7. Changes */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">7. Changes to This Policy</h2>
                        <p>
                            We may update this Copyright Policy from time to time. We will notify users of material changes by updating the date at the top of this page. Continued use of HangHut after changes are posted constitutes acceptance of the revised policy.
                        </p>
                    </section>

                    <div className="border-t border-border pt-8 text-sm text-muted-foreground">
                        <p>
                            For questions about this policy, contact us at{" "}
                            <a href="mailto:contact@hanghut.com" className="text-primary hover:underline">
                                contact@hanghut.com
                            </a>.
                        </p>
                        <div className="flex flex-wrap gap-4 mt-4">
                            <Link href="/privacy-policy" className="text-primary hover:underline">Privacy Policy</Link>
                            <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>
                            <Link href="/child-safety" className="text-primary hover:underline">Child Safety Standards</Link>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
