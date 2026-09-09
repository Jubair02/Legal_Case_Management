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
  KeyRound,
  Loader2,
  Lock,
  LogIn,
  Mail,
  Receipt,
  ScrollText,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { BrandMark } from "@/components/shared/brand-mark"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiSend } from "@/lib/api-client"
import { useLanguage, type Lang } from "@/lib/i18n/language"
import { cn } from "@/lib/utils"
import type { SessionUser } from "@/lib/types"

interface Feature {
  icon: LucideIcon
  titleKey: string
  descriptionKey: string
}

const FEATURES: Feature[] = [
  { icon: Gavel, titleKey: "login.featureCases", descriptionKey: "login.featureCasesDesc" },
  { icon: FileText, titleKey: "login.featureDocuments", descriptionKey: "login.featureDocumentsDesc" },
  { icon: Receipt, titleKey: "login.featureBilling", descriptionKey: "login.featureBillingDesc" },
  { icon: Bell, titleKey: "login.featureReminders", descriptionKey: "login.featureRemindersDesc" },
]

/** Security assurances — each one maps to a capability the app actually has. */
const TRUST: { icon: LucideIcon; key: string }[] = [
  { icon: ShieldCheck, key: "login.trustEncrypted" },
  { icon: KeyRound, key: "login.trustRoles" },
  { icon: ScrollText, key: "login.trustAudit" },
]

interface DemoAccount {
  labelKey: string
  icon: LucideIcon
  email: string
  password: string
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { labelKey: "login.demoAdmin", icon: Crown, email: "admin@ainsheba.bd", password: "Admin@123" },
  { labelKey: "login.demoLawyer", icon: Gavel, email: "kamal@ainsheba.bd", password: "Lawyer@123" },
  { labelKey: "login.demoStaff", icon: Briefcase, email: "staff@ainsheba.bd", password: "Staff@123" },
  { labelKey: "login.demoClient", icon: UserIcon, email: "client@ainsheba.bd", password: "Client@123" },
]

/**
 * Demo quick-fill buttons are a development convenience only — they are
 * compiled out of production builds (set NEXT_PUBLIC_ENABLE_DEMO_ACCOUNTS=true
 * to force them on).
 */
const SHOW_DEMO_ACCOUNTS =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_DEMO_ACCOUNTS === "true"

const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "bn", label: "বাং" },
]

/** EN/বাং switch. Sign-in is the one place the app is used before the shell
 *  exists, so the language choice has to be reachable from here too. */
function LanguageToggle() {
  const { lang, setLang, t } = useLanguage()
  return (
    <div
      role="group"
      aria-label={t("common.language")}
      className="inline-flex items-center gap-0.5 rounded-full border border-border/80 bg-card/80 p-0.5 shadow-soft backdrop-blur"
    >
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          className={cn(
            "cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            lang === l.code
              ? "bg-emerald-700 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}

export interface LoginScreenProps {
  onLogin: (user: SessionUser) => void
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const { t } = useLanguage()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)

  const signIn = async (em: string, pw: string) => {
    if (pending) return
    setPending(true)
    try {
      const user = await apiSend<SessionUser>("POST", "/api/auth/login", { email: em.trim(), password: pw })
      toast.success(t("login.welcome", { name: user.name }))
      onLogin(user)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("login.errorGeneric"))
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
    <div className="u-paper flex min-h-screen flex-col lg:flex-row">
      {/* ================= LEFT — chamber panel (desktop only) ================= */}
      <aside className="u-forest u-engrave u-bloom relative hidden max-h-screen overflow-hidden text-emerald-50 lg:flex lg:w-[46%] lg:max-w-2xl lg:flex-col lg:justify-between lg:gap-10 lg:overflow-y-auto lg:p-12">
        {/* Typographic watermark: the Bangla name, set huge and nearly
            invisible. Clipped by its own layer so it adds no scroll height. */}
        <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <span className="absolute -bottom-10 -right-16 select-none text-[11rem] font-bold leading-none tracking-tight text-white/[0.035]">
            আইনসেবা
          </span>
        </span>

        {/* Brand lockup */}
        <div className="u-rise relative z-10 flex shrink-0 items-center gap-3.5">
          <BrandMark className="h-12 w-12 shadow-seal" />
          <div>
            <p className="u-wordmark text-[1.6rem] font-semibold leading-none tracking-tight text-white">
              {t("common.appName")}
            </p>
            <p className="mt-1.5 text-sm text-emerald-100/70">আইনসেবা</p>
          </div>
        </div>

        {/* Editorial pitch */}
        <div className="relative z-10">
          <p className="u-rise u-eyebrow text-brass" style={{ "--d": "60ms" } as React.CSSProperties}>
            {t("login.eyebrow")}
          </p>
          <h1
            className="u-rise mt-5 max-w-md font-serif text-[2.25rem] font-semibold leading-[1.08] tracking-tight text-white xl:text-[2.75rem]"
            style={{ "--d": "110ms" } as React.CSSProperties}
          >
            {t("login.heroTitle")}
          </h1>
          <p
            className="u-rise mt-4 max-w-sm text-sm leading-relaxed text-emerald-100/75"
            style={{ "--d": "160ms" } as React.CSSProperties}
          >
            {t("login.heroBody")}
          </p>

          <hr className="u-rule u-rise mt-9 max-w-md" style={{ "--d": "200ms" } as React.CSSProperties} />

          <p
            className="u-rise u-eyebrow mt-7 text-emerald-100/60"
            style={{ "--d": "230ms" } as React.CSSProperties}
          >
            {t("login.featuresTitle")}
          </p>
          <ul className="mt-3 divide-y divide-white/[0.07]">
            {FEATURES.map((f, i) => {
              const Icon = f.icon
              return (
                <li
                  key={f.titleKey}
                  className="u-rise flex items-start gap-4 py-4"
                  style={{ "--d": `${270 + i * 60}ms` } as React.CSSProperties}
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-brass ring-1 ring-white/10">
                    <Icon className="h-[1.05rem] w-[1.05rem]" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{t(f.titleKey)}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-emerald-100/70">
                      {t(f.descriptionKey)}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Trust row + colophon */}
        <div className="u-rise relative z-10 shrink-0 space-y-5" style={{ "--d": "520ms" } as React.CSSProperties}>
          <ul className="flex flex-wrap gap-2">
            {TRUST.map((item) => {
              const Icon = item.icon
              return (
                <li
                  key={item.key}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-emerald-100/80"
                >
                  <Icon className="h-3.5 w-3.5 text-brass" />
                  {t(item.key)}
                </li>
              )
            })}
          </ul>
          <p className="text-[11px] text-emerald-100/55">{t("login.footerNote")}</p>
        </div>
      </aside>

      {/* ===================== RIGHT — sign-in ===================== */}
      <main className="relative flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-8">
        <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
          <LanguageToggle />
        </div>

        <div className="w-full max-w-[26rem]">
          {/* Mobile brand lockup — the panel above is desktop-only */}
          <div className="u-rise mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
            <BrandMark className="h-14 w-14 shadow-seal" />
            <div>
              <p className="u-wordmark text-2xl font-semibold leading-none tracking-tight text-ink">
                {t("common.appName")}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                আইনসেবা · {t("common.appTagline")}
              </p>
            </div>
          </div>

          {/* Sign-in card */}
          <section
            className="u-rise u-crest rounded-2xl border border-border/70 bg-card p-7 shadow-lift sm:p-8"
            style={{ "--d": "80ms" } as React.CSSProperties}
          >
            <h2 className="font-serif text-[1.4rem] font-semibold leading-tight tracking-tight text-ink">
              {t("login.title")}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t("login.subtitle")}</p>

            <hr className="u-rule mt-6" />

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="login-email" className="u-eyebrow text-muted-foreground">
                  {t("login.email")}
                </Label>
                <div className="relative">
                  <Mail
                    aria-hidden
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70"
                  />
                  <Input
                    id="login-email"
                    type="email"
                    placeholder={t("login.emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    disabled={pending}
                    required
                    className="h-11 pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password" className="u-eyebrow text-muted-foreground">
                  {t("login.password")}
                </Label>
                <div className="relative">
                  <Lock
                    aria-hidden
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70"
                  />
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={pending}
                    required
                    className="h-11 pl-10 pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                    className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={pending}
                className="h-11 w-full cursor-pointer bg-gradient-to-b from-emerald-700 to-emerald-800 text-[0.9375rem] font-medium tracking-tight shadow-seal transition-all duration-200 hover:from-emerald-600 hover:to-emerald-700 hover:shadow-lift disabled:cursor-not-allowed"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                {pending ? t("login.signingIn") : t("login.signIn")}
              </Button>
            </form>

            <p className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
              <ShieldCheck aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-700/70" />
              {t("login.securityNote")}
            </p>
          </section>

          {/* Demo quick-fill — development only */}
          {SHOW_DEMO_ACCOUNTS ? (
            <section
              className="u-rise mt-6 rounded-xl border border-dashed border-border bg-paper-shade/60 p-5"
              style={{ "--d": "150ms" } as React.CSSProperties}
            >
              <p className="u-eyebrow text-muted-foreground">{t("login.demoTitle")}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">{t("login.demoSubtitle")}</p>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {DEMO_ACCOUNTS.map((acc) => {
                  const Icon = acc.icon
                  return (
                    <button
                      key={acc.email}
                      type="button"
                      disabled={pending}
                      onClick={() => quickFill(acc)}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/80 bg-card px-3 py-2.5 text-left transition-all duration-200 hover:-translate-y-px hover:border-emerald-600/30 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-emerald-700" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-medium text-foreground">
                          {t(acc.labelKey)}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {acc.email}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          ) : null}

          {/* Colophon for the mobile layout, where the panel is hidden */}
          <p className="mt-8 text-center text-[11px] text-muted-foreground lg:hidden">
            {t("login.footerNote")}
          </p>
        </div>
      </main>
    </div>
  )
}
