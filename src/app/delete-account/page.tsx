'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Header from '@/components/landing/header'
import Footer from '@/components/landing/footer'
import Link from 'next/link'
import { ArrowLeft, Trash2, Lock, AlertTriangle, CheckCircle2, Loader2, ShieldAlert, Clock, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

type Step = 'info' | 'login' | 'confirm' | 'deleting' | 'done'

const DATA_DELETED = [
  { icon: '👤', label: 'Profile information', desc: 'Name, bio, profile photo, and all personal details' },
  { icon: '💬', label: 'Messages & chats', desc: 'All direct messages, group chats, and chat media' },
  { icon: '📸', label: 'Posts & stories', desc: 'All photos, videos, and story content you\'ve shared' },
  { icon: '👥', label: 'Social connections', desc: 'Friends list, group memberships, and followers' },
  { icon: '🔔', label: 'Notifications', desc: 'All notification history and preferences' },
  { icon: '📍', label: 'Trip & activity data', desc: 'Trip plans, activity history, and check-ins' },
]

const DATA_RETAINED = [
  { icon: '🧾', label: 'Transaction records', desc: 'Payment and refund records are retained for tax and legal compliance', period: '5 years' },
  { icon: '🎫', label: 'Ticket purchase history', desc: 'Anonymized ticket records retained for event organizer reporting', period: '1 year' },
  { icon: '📋', label: 'Legal & compliance logs', desc: 'Fraud prevention and audit logs as required by Philippine law', period: '5 years' },
]

export default function DeleteAccountPage() {
  const [step, setStep] = useState<Step>('info')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')

  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

      if (authError) {
        setError('Invalid email or password. Please try again.')
        setLoading(false)
        return
      }

      setStep('confirm')
    } catch {
      setError('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') return

    setStep('deleting')
    setError(null)

    try {
      const { error: fnError } = await supabase.functions.invoke('delete-user-account')

      if (fnError) {
        setError(fnError.message || 'Failed to delete account. Please try again or contact support.')
        setStep('confirm')
        return
      }

      await supabase.auth.signOut()
      setStep('done')
    } catch {
      setError('An unexpected error occurred. Please contact support at support@hanghut.com')
      setStep('confirm')
    }
  }

  return (
    <div className="flex min-h-dvh flex-col font-sans antialiased" style={{ backgroundColor: '#FAFAF8' }}>
      <Header />

      <main className="flex-1 pt-28 pb-16">
        <div className="container mx-auto max-w-3xl px-6 md:px-12">

          {/* ─── STEP: INFO ─── */}
          {step === 'info' && (
            <div className="space-y-10 animate-in fade-in duration-500">
              {/* Back link */}
              <Link href="/" className="inline-flex items-center text-muted-foreground hover:text-primary transition-colors">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Link>

              {/* Header */}
              <div className="space-y-2 border-b border-border pb-8">
                <p className="text-sm font-medium text-primary uppercase tracking-wider">HangHut Inc.</p>
                <h1 className="font-headline font-bold text-4xl md:text-5xl text-foreground">Delete Your Account</h1>
                <p className="text-muted-foreground">
                  We&rsquo;re sorry to see you go. Please review the information below before proceeding.
                </p>
              </div>

              {/* Steps to delete */}
              <section>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold text-foreground">How to Delete Your Account</h2>
                </div>
                <Card className="border-border/60">
                  <CardContent className="p-6 space-y-4">
                    {[
                      { num: 1, text: 'Click "Continue to Sign In" below and log in with your HangHut email and password.' },
                      { num: 2, text: 'Review the summary of data that will be permanently deleted.' },
                      { num: 3, text: 'Type "DELETE" to confirm and submit your deletion request.' },
                      { num: 4, text: 'Your account and personal data will be permanently removed from HangHut.' },
                    ].map(({ num, text }) => (
                      <div key={num} className="flex items-start gap-4">
                        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-semibold text-primary">
                          {num}
                        </span>
                        <p className="text-foreground/80 pt-1 leading-relaxed">{text}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </section>

              {/* Data deleted */}
              <section>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                    <Trash2 className="w-5 h-5 text-destructive" />
                  </div>
                  <h2 className="text-2xl font-bold text-foreground">Data That Will Be Permanently Deleted</h2>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {DATA_DELETED.map(({ icon, label, desc }) => (
                    <Card key={label} className="border-destructive/10 bg-destructive/[0.02] hover:bg-destructive/[0.04] transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3 mb-1.5">
                          <span className="text-lg">{icon}</span>
                          <span className="font-semibold text-sm text-foreground">{label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground pl-8">{desc}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>

              {/* Data retained */}
              <section>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-amber-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-foreground">Data Retained for Legal Compliance</h2>
                </div>
                <div className="space-y-3">
                  {DATA_RETAINED.map(({ icon, label, desc, period }) => (
                    <Card key={label} className="border-amber-500/15 bg-amber-500/[0.02]">
                      <CardContent className="p-4 flex items-start gap-4">
                        <span className="text-lg flex-shrink-0">{icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="font-semibold text-sm text-foreground">{label}</span>
                            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 flex-shrink-0">
                              {period}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{desc}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>

              {/* Alternative */}
              <Card className="border-border/60 bg-muted/30">
                <CardContent className="p-5 flex items-start gap-4">
                  <ShieldAlert className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1">You can also delete from the app</p>
                    <p className="text-xs text-muted-foreground">
                      Open the HangHut app → Settings → Account → Delete Account. The same process applies.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* CTA Button */}
              <Button
                onClick={() => setStep('login')}
                variant="destructive"
                size="lg"
                className="rounded-full px-8"
              >
                Continue to Sign In
              </Button>
            </div>
          )}

          {/* ─── STEP: LOGIN ─── */}
          {step === 'login' && (
            <div className="animate-in fade-in duration-500 max-w-md mx-auto">
              <button
                onClick={() => setStep('info')}
                className="text-sm text-muted-foreground hover:text-primary mb-8 flex items-center gap-1 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>

              <Card className="border-border/60 overflow-hidden">
                <CardContent className="p-8">
                  <div className="text-center mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                      <Lock className="w-6 h-6 text-primary" />
                    </div>
                    <h2 className="text-xl font-bold text-foreground">Verify Your Identity</h2>
                    <p className="text-sm text-muted-foreground mt-1">Sign in to confirm this is your account</p>
                  </div>

                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="delete-email">Email</Label>
                      <Input
                        id="delete-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={loading}
                        placeholder="your@email.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="delete-password">Password</Label>
                      <Input
                        id="delete-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={loading}
                        placeholder="••••••••"
                      />
                    </div>

                    {error && (
                      <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                        {error}
                      </div>
                    )}

                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-full"
                      size="lg"
                    >
                      {loading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Signing in...
                        </span>
                      ) : 'Sign In & Continue'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ─── STEP: CONFIRM ─── */}
          {step === 'confirm' && (
            <div className="animate-in fade-in duration-500 max-w-md mx-auto">
              <Card className="border-destructive/20 overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-destructive to-red-400" />
                <CardContent className="p-8">
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 rounded-full bg-destructive/10 border-2 border-destructive/20 flex items-center justify-center mx-auto mb-4">
                      <AlertTriangle className="w-7 h-7 text-destructive" />
                    </div>
                    <h2 className="text-xl font-bold text-destructive">This action is irreversible</h2>
                    <p className="text-sm text-muted-foreground mt-2">
                      Signed in as <span className="text-foreground font-medium">{email}</span>
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-muted/50 border border-border mb-6">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Your profile, messages, posts, stories, friends, groups, and all associated media will be{' '}
                      <span className="text-destructive font-medium">permanently deleted</span>.
                      Transaction records will be retained for legal compliance. This cannot be undone.
                    </p>
                  </div>

                  <div className="mb-6 space-y-2">
                    <Label htmlFor="confirm-delete">
                      Type <span className="font-mono text-destructive font-bold">DELETE</span> to confirm
                    </Label>
                    <Input
                      id="confirm-delete"
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder="DELETE"
                      autoComplete="off"
                      className="text-center tracking-widest font-mono"
                    />
                  </div>

                  {error && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive mb-4">
                      {error}
                    </div>
                  )}

                  <Button
                    onClick={handleDelete}
                    disabled={confirmText !== 'DELETE'}
                    variant="destructive"
                    size="lg"
                    className="w-full rounded-full"
                  >
                    Permanently Delete My Account
                  </Button>

                  <button
                    onClick={async () => {
                      await supabase.auth.signOut()
                      setStep('info')
                      setConfirmText('')
                      setEmail('')
                      setPassword('')
                      setError(null)
                    }}
                    className="w-full mt-3 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel — I want to keep my account
                  </button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ─── STEP: DELETING ─── */}
          {step === 'deleting' && (
            <div className="animate-in fade-in duration-500 text-center py-24">
              <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-6" />
              <h2 className="text-xl font-bold text-foreground mb-2">Deleting your account...</h2>
              <p className="text-sm text-muted-foreground">This may take a few moments. Please don&apos;t close this page.</p>
            </div>
          )}

          {/* ─── STEP: DONE ─── */}
          {step === 'done' && (
            <div className="animate-in fade-in duration-500 max-w-md mx-auto text-center py-20">
              <div className="w-16 h-16 rounded-full bg-green-100 border-2 border-green-200 flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-3">Account Deleted</h2>
              <p className="text-muted-foreground mb-2">
                Your HangHut account and personal data have been permanently removed.
              </p>
              <p className="text-sm text-muted-foreground/70 mb-8">
                Transaction records will be retained for up to 5 years as required by law. All other data has been erased.
              </p>
              <Link href="/">
                <Button variant="outline" className="rounded-full px-6">
                  Return to HangHut
                </Button>
              </Link>
            </div>
          )}

        </div>
      </main>

      <Footer />
    </div>
  )
}
