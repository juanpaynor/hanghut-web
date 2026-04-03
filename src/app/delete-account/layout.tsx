import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Delete Your Account',
  description: 'Request permanent deletion of your HangHut account and personal data. Review what data is deleted and what is retained for legal compliance.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function DeleteAccountLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
