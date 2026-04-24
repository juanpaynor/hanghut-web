import Link from "next/link";
import { ArrowLeft, ShieldCheck, AlertTriangle, Mail, Phone, FileText, Users } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Child Safety Standards | HangHut",
    description: "HangHut's standards and policies against child sexual abuse and exploitation (CSAE). Learn how we protect minors on our platform.",
};

export default function ChildSafetyPage() {
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
                    <h1 className="font-headline font-bold text-4xl md:text-5xl">Child Safety Standards</h1>
                    <p className="text-muted-foreground">Last Updated: April 24, 2026</p>
                </div>

                {/* Commitment Banner */}
                <div className="flex items-start gap-4 bg-green-500/10 border border-green-500/20 rounded-xl p-5">
                    <ShieldCheck className="h-6 w-6 text-green-500 mt-0.5 shrink-0" />
                    <p className="text-foreground/90 leading-relaxed">
                        HangHut is committed to providing a safe platform for all users. We have a zero-tolerance policy toward child sexual abuse and exploitation (CSAE) in any form. This page outlines our standards, enforcement practices, and how to report concerns.
                    </p>
                </div>

                <div className="prose prose-zinc dark:prose-invert max-w-none space-y-10 text-foreground/90 font-light leading-relaxed">

                    {/* 1. Prohibited Content and Conduct */}
                    <section>
                        <div className="flex items-center gap-3 mb-4">
                            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                            <h2 className="text-2xl font-bold text-foreground m-0">1. Prohibited Content and Conduct</h2>
                        </div>
                        <p>
                            HangHut strictly prohibits all content and conduct that constitutes child sexual abuse and exploitation (CSAE), including but not limited to:
                        </p>
                        <ul className="list-disc pl-5 space-y-2 mt-4">
                            <li>Child sexual abuse material (CSAM) of any kind, including images, videos, text, or any other media depicting the sexual abuse or exploitation of minors.</li>
                            <li>Grooming, solicitation, or any attempt to exploit minors for sexual purposes.</li>
                            <li>Sharing, distributing, or requesting CSAM through any feature of the platform, including direct messages, group chats, posts, or event listings.</li>
                            <li>Using HangHut to facilitate real-world contact with a minor for exploitative purposes.</li>
                            <li>Any content that sexualizes individuals under the age of 18.</li>
                        </ul>
                        <p className="mt-4">
                            Violations of this policy will result in immediate and permanent account termination and will be reported to the appropriate authorities, including the <strong>National Center for Missing &amp; Exploited Children (NCMEC)</strong> via its CyberTipline, and to relevant law enforcement agencies in the Philippines and internationally.
                        </p>
                    </section>

                    {/* 2. Enforcement */}
                    <section>
                        <div className="flex items-center gap-3 mb-4">
                            <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
                            <h2 className="text-2xl font-bold text-foreground m-0">2. Enforcement and Detection</h2>
                        </div>
                        <p>HangHut takes a multi-layered approach to detecting and removing CSAE content:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-4">
                            <li><strong>User Reporting:</strong> All users can report any content or account directly within the app using our in-app reporting system (see Section 3 below).</li>
                            <li><strong>Proactive Review:</strong> Reports are reviewed by our Trust &amp; Safety team on a priority basis. CSAE reports are treated as the highest priority.</li>
                            <li><strong>Account Termination:</strong> Any account found to be in violation is immediately suspended pending investigation and permanently banned upon confirmation.</li>
                            <li><strong>Legal Reporting:</strong> We will report confirmed CSAM to NCMEC&apos;s CyberTipline and cooperate fully with law enforcement investigations.</li>
                            <li><strong>Evidence Preservation:</strong> We preserve evidence of violations in accordance with applicable law to support law enforcement efforts.</li>
                        </ul>
                    </section>

                    {/* 3. In-App Reporting */}
                    <section>
                        <div className="flex items-center gap-3 mb-4">
                            <Phone className="h-5 w-5 text-primary shrink-0" />
                            <h2 className="text-2xl font-bold text-foreground m-0">3. In-App Reporting Mechanism</h2>
                        </div>
                        <p>
                            HangHut provides an in-app mechanism to report any user, post, message, or content that you believe violates our Child Safety Standards or any other policy.
                        </p>
                        <div className="bg-muted/50 border border-border rounded-lg p-5 mt-4 space-y-2">
                            <p className="font-medium text-foreground">How to report in the app:</p>
                            <ol className="list-decimal pl-5 space-y-2 text-foreground/80">
                                <li>Navigate to the user profile, post, or message you want to report.</li>
                                <li>Tap the <strong>⋯ (more options)</strong> or <strong>flag icon</strong>.</li>
                                <li>Select <strong>&ldquo;Report&rdquo;</strong> and choose the appropriate reason (e.g., &ldquo;Child Safety&rdquo; or &ldquo;Inappropriate Content&rdquo;).</li>
                                <li>Add any additional details and submit. Our team will review the report promptly.</li>
                            </ol>
                        </div>
                        <p className="mt-4">
                            You may also report concerns directly by email at{" "}
                            <a href="mailto:contact@hanghut.com" className="text-primary hover:underline font-medium">
                                contact@hanghut.com
                            </a>{" "}
                            with the subject line <strong>&ldquo;Child Safety Report&rdquo;</strong>.
                        </p>
                    </section>

                    {/* 4. Compliance with Child Safety Laws */}
                    <section>
                        <div className="flex items-center gap-3 mb-4">
                            <FileText className="h-5 w-5 text-primary shrink-0" />
                            <h2 className="text-2xl font-bold text-foreground m-0">4. Compliance with Child Safety Laws</h2>
                        </div>
                        <p>HangHut complies with all applicable child safety laws and regulations, including:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-4">
                            <li><strong>Republic Act No. 9775</strong> (Anti-Child Pornography Act of 2009, Philippines)</li>
                            <li><strong>Republic Act No. 7610</strong> (Special Protection of Children Against Abuse, Exploitation and Discrimination Act, Philippines)</li>
                            <li><strong>PROTECT Our Children Act</strong> and applicable US federal law for platforms with international reach</li>
                            <li>The <strong>CyberTipline</strong> reporting obligations to NCMEC for CSAM discovered on our platform</li>
                        </ul>
                        <p className="mt-4">
                            We cooperate fully and promptly with law enforcement agencies and regulatory bodies in any investigation related to child safety.
                        </p>
                    </section>

                    {/* 5. Age Restrictions */}
                    <section>
                        <div className="flex items-center gap-3 mb-4">
                            <Users className="h-5 w-5 text-primary shrink-0" />
                            <h2 className="text-2xl font-bold text-foreground m-0">5. Age Restrictions</h2>
                        </div>
                        <p>
                            HangHut is intended for users aged <strong>18 and above</strong>. We do not knowingly allow users under 18 to create accounts. If we become aware that a user is under 18, we will immediately suspend their account and delete any associated data in accordance with our Privacy Policy.
                        </p>
                        <p className="mt-4">
                            If you believe a minor has created an account on HangHut, please report it immediately to{" "}
                            <a href="mailto:contact@hanghut.com" className="text-primary hover:underline font-medium">
                                contact@hanghut.com
                            </a>.
                        </p>
                    </section>

                    {/* 6. Point of Contact */}
                    <section>
                        <div className="flex items-start gap-4 bg-primary/5 border border-primary/20 rounded-xl p-6 mt-4">
                            <Mail className="h-6 w-6 text-primary mt-0.5 shrink-0" />
                            <div>
                                <h2 className="text-xl font-bold text-foreground mb-2">Child Safety Point of Contact</h2>
                                <p className="text-foreground/80 mb-3">
                                    For any child safety concerns, CSAE reports, law enforcement requests, or questions about this policy, please contact our designated Child Safety team directly:
                                </p>
                                <div className="space-y-1 text-foreground/90">
                                    <p><strong>Email:</strong>{" "}
                                        <a href="mailto:contact@hanghut.com" className="text-primary hover:underline">
                                            contact@hanghut.com
                                        </a>
                                    </p>
                                    <p><strong>Subject line:</strong> Child Safety — [Brief Description]</p>
                                    <p><strong>Organization:</strong> HangHut Inc.</p>
                                </div>
                                <p className="text-sm text-muted-foreground mt-3">
                                    We aim to respond to all child safety reports within 24 hours. Reports involving imminent danger will be escalated immediately to law enforcement.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* 7. External Resources */}
                    <section>
                        <h2 className="text-2xl font-bold text-foreground mb-4">7. External Resources</h2>
                        <p>If you or someone you know needs immediate help, please contact:</p>
                        <ul className="list-disc pl-5 space-y-2 mt-4 text-foreground/80">
                            <li>
                                <strong>NCMEC CyberTipline:</strong>{" "}
                                <a href="https://www.cybertipline.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                    www.cybertipline.org
                                </a>{" "}
                                — Report CSAM or online exploitation
                            </li>
                            <li>
                                <strong>Philippine National Police (PNP):</strong> Emergency hotline 911
                            </li>
                            <li>
                                <strong>Council for the Welfare of Children (Philippines):</strong>{" "}
                                <a href="https://cwc.gov.ph" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                    cwc.gov.ph
                                </a>
                            </li>
                            <li>
                                <strong>Internet Watch Foundation:</strong>{" "}
                                <a href="https://www.iwf.org.uk/report" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                    www.iwf.org.uk/report
                                </a>
                            </li>
                        </ul>
                    </section>

                    <div className="border-t border-border pt-8 text-sm text-muted-foreground">
                        <p>This policy is reviewed and updated regularly. For previous versions or questions, contact us at{" "}
                            <a href="mailto:contact@hanghut.com" className="text-primary hover:underline">contact@hanghut.com</a>.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
