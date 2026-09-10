"use client"

import { ArrowRight, LogIn } from "lucide-react"

import { BrandMark } from "@/components/shared/brand-mark"
import { Button } from "@/components/ui/button"
import { LanguageProvider, useLanguage } from "@/lib/i18n/language"
import { DEFAULT_ROUTE, LOGIN_ROUTE } from "@/lib/routes"

/**
 * Root 404.
 *
 * Middleware hands every unmatched path straight to this page (see the
 * `!match` branch in src/middleware.ts), so it is reached from outside the
 * signed-in shell — there is no session, no sidebar and no way back except
 * the links offered here. It therefore carries its own chrome, and offers
 * both destinations because we cannot know whether the visitor is signed in.
 *
 * Plain anchors rather than `navigate()`: this renders above the (app) layout,
 * so no session context exists, and a full navigation is the right cost on a
 * dead end.
 */
function NotFoundBody() {
  const { t } = useLanguage()

  return (
    <main className="u-paper flex min-h-screen flex-col items-center justify-center px-5 py-16">
      <div className="u-rise w-full max-w-lg">
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-lift">
          {/* Forest crest — the same masthead treatment as sign-in and the boot splash. */}
          <div className="u-forest u-engrave u-bloom relative bg-forest-deep px-6 py-8">
            <div className="relative z-10 flex flex-col items-center gap-4 text-center">
              <BrandMark className="h-12 w-12 shadow-seal" />
              <div>
                <p className="u-wordmark text-xl font-semibold leading-none tracking-tight text-white">
                  {t("common.appName")}
                </p>
                <p className="u-eyebrow mt-2.5 text-brass">404</p>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-6 text-center sm:p-8">
            <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-ink">
              {t("errors.notFoundTitle")}
            </h1>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
              {t("errors.notFoundDesc")}
            </p>

            <span aria-hidden className="u-rule mx-auto block max-w-[9rem]" />

            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-center">
              <Button asChild className="cursor-pointer">
                <a href={DEFAULT_ROUTE}>
                  {t("errors.backToDashboard")} <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild variant="outline" className="cursor-pointer">
                <a href={LOGIN_ROUTE}>
                  <LogIn className="h-4 w-4" /> {t("login.signIn")}
                </a>
              </Button>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground/70">
          {t("shell.footerBuiltFor")}
        </p>
      </div>
    </main>
  )
}

export default function NotFound() {
  // The root layout mounts no LanguageProvider — pages outside the (app)
  // group bring their own, exactly as the sign-in screen does.
  return (
    <LanguageProvider>
      <NotFoundBody />
    </LanguageProvider>
  )
}
