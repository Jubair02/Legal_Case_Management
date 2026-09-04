"use client"

import { useState } from "react"
import {
  Bell,
  Briefcase,
  Crown,
  Eye,
  EyeOff,
  FileText,
  Gavel,
  Loader2,
  LogIn,
  Receipt,
  Scale,
  User as UserIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiSend } from "@/lib/api-client"
import type { SessionUser } from "@/lib/types"

interface Feature {
  icon: LucideIcon
  title: string
  description: string
}

const FEATURES: Feature[] = [
  { icon: Gavel, title: "Cases, Hearings & Orders", description: "Track every matter from filing to final order." },
  { icon: FileText, title: "Documents & Vakalatnama", description: "A secure vault for court papers and client files." },
  { icon: Receipt, title: "Invoices, bKash/Nagad/Rocket", description: "Bill clients and collect via mobile wallets." },
  { icon: Bell, title: "Hearing Reminders", description: "Today & tomorrow alerts so no date is missed." },
]

interface DemoAccount {
  label: string
  icon: LucideIcon
  email: string
  password: string
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { label: "Admin", icon: Crown, email: "admin@ainsheba.bd", password: "Admin@123" },
  { label: "Lawyer", icon: Gavel, email: "kamal@ainsheba.bd", password: "Lawyer@123" },
  { label: "Staff", icon: Briefcase, email: "staff@ainsheba.bd", password: "Staff@123" },
  { label: "Client", icon: UserIcon, email: "client@ainsheba.bd", password: "Client@123" },
]

export interface LoginScreenProps {
  onLogin: (user: SessionUser) => void
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)

  const signIn = async (em: string, pw: string) => {
    if (pending) return
    setPending(true)
    try {
      const user = await apiSend<SessionUser>("POST", "/api/auth/login", { email: em.trim(), password: pw })
      toast.success(`Welcome back, ${user.name}`)
      onLogin(user)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign in failed. Please try again.")
    } finally {
      setPending(false)
    }
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    void signIn(email, password)
  }

  const quickFill = (acc: DemoAccount) => {
    setEmail(acc.email)
    setPassword(acc.password)
    void signIn(acc.email, acc.password)
  }

  return (
    <div className="flex min-h-screen bg-stone-50">
      {/* LEFT — brand panel (desktop only) */}
      <div className="relative hidden w-[46%] max-w-xl flex-col justify-between overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-950 p-10 text-emerald-50 lg:flex">
        {/* decorative radial-dot pattern */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        <div className="relative flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-950/60">
            <Scale className="h-6 w-6" />
          </span>
          <div>
            <p className="text-2xl font-bold tracking-tight text-white">AinSheba</p>
            <p className="text-sm text-emerald-200/70">আইনসেবা</p>
          </div>
        </div>

        <div className="relative space-y-6">
          <p className="text-sm font-medium uppercase tracking-wider text-emerald-200/60">
            Legal Case Management — Bangladesh
          </p>
          <div className="space-y-5">
            {FEATURES.map((f) => {
              const Icon = f.icon
              return (
                <div key={f.title} className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-emerald-100">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-white">{f.title}</p>
                    <p className="text-xs text-emerald-200/60">{f.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <p className="relative text-xs text-emerald-200/40">© 2026 AinSheba · আইনসেবা — built for chambers & advocates</p>
      </div>

      {/* RIGHT — sign-in form */}
      <div className="flex flex-1 flex-col items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-md space-y-5">
          <div className="flex flex-col items-center gap-2 text-center lg:hidden">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <Scale className="h-6 w-6" />
            </span>
            <p className="text-xl font-semibold tracking-tight">AinSheba</p>
            <p className="text-xs text-muted-foreground">আইনসেবা · Legal Case Management — Bangladesh</p>
          </div>

          <Card className="border-stone-200/80">
            <CardHeader>
              <CardTitle className="text-lg font-semibold tracking-tight">Sign in to your chamber</CardTitle>
              <CardDescription>Enter your email and password to access your cases.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="you@chamber.bd"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    disabled={pending}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      disabled={pending}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                  {pending ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-stone-200/80">
            <CardHeader>
              <CardTitle className="text-sm">Demo accounts</CardTitle>
              <CardDescription className="text-xs">One-click sign in with a seeded role account.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {DEMO_ACCOUNTS.map((acc) => {
                const Icon = acc.icon
                return (
                  <Button
                    key={acc.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    disabled={pending}
                    onClick={() => quickFill(acc)}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-emerald-700" />
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-xs font-medium">{acc.label}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{acc.email}</span>
                    </span>
                  </Button>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
