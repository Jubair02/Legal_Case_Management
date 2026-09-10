"use client"

import { AlertTriangle, ArrowRight, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useLanguage } from "@/lib/i18n/language"
import { DEFAULT_ROUTE } from "@/lib/routes"

/**
 * Error boundary for every signed-in route.
 *
 * Being a segment error file it renders *inside* the (app) layout, so the
 * sidebar, header and LanguageProvider are all still mounted — the failure is
 * contained to the page body and the rest of the chamber stays navigable.
 * `reset()` re-renders the segment without a full reload.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { t } = useLanguage()

  return (
    <div className="flex flex-1 items-center justify-center py-10">
      <section className="u-rise w-full max-w-md overflow-hidden rounded-xl border border-border/80 bg-card p-6 text-center shadow-soft sm:p-8">
        <span
          aria-hidden
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600 ring-1 ring-rose-600/15"
        >
          <AlertTriangle className="h-5 w-5" />
        </span>

        <h1 className="mt-4 font-serif text-xl font-semibold leading-tight tracking-tight text-ink">
          {t("errors.crashTitle")}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {t("errors.crashDesc")}
        </p>

        <span aria-hidden className="u-rule mx-auto mt-5 block max-w-[8rem]" />

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button className="cursor-pointer" onClick={() => reset()}>
            <RotateCcw className="h-4 w-4" /> {t("common.retry")}
          </Button>
          <Button asChild variant="outline" className="cursor-pointer">
            <a href={DEFAULT_ROUTE}>
              {t("errors.backToDashboard")} <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        </div>

        {/* Next redacts the message in production; the digest is what support
            can actually correlate with a server log. */}
        {error.digest ? (
          <p className="mt-5 font-mono text-[11px] text-muted-foreground/70">
            {t("errors.reference", { digest: error.digest })}
          </p>
        ) : null}
      </section>
    </div>
  )
}
