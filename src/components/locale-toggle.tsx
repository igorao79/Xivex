"use client";

import { Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function LocaleToggle() {
  const { locale, setLocale } = useI18n();

  return (
    <button
      onClick={() => setLocale(locale === "ru" ? "en" : "ru")}
      className="flex items-center justify-center gap-1.5 rounded-lg border size-8 sm:size-auto sm:px-2.5 sm:py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer active:scale-[0.95] transition-all duration-150"
      title={locale === "ru" ? "Switch to English" : "Переключить на русский"}
    >
      <Languages className="size-4" />
      <span className="hidden sm:inline uppercase">{locale}</span>
    </button>
  );
}
