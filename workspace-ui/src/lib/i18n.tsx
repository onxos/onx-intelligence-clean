"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import { ar, en, type LocaleDictionary } from "@/lib/locales";

type Locale = "en" | "ar";
type Direction = "ltr" | "rtl";

type I18nContextValue = {
  locale: Locale;
  direction: Direction;
  isRtl: boolean;
  setLocale: (next: Locale) => void;
  t: (key: string, fallback?: string, params?: Record<string, string | number>) => string;
};

const LOCALE_KEY = "onx_workspace_locale";

const dictionary: Record<Locale, LocaleDictionary> = { en, ar };

const I18nContext = createContext<I18nContextValue | null>(null);

function getNested(dict: LocaleDictionary, key: string): string | undefined {
  const parts = key.split(".");
  let current: string | LocaleDictionary | undefined = dict;
  for (const part of parts) {
    if (!current || typeof current === "string") {
      return undefined;
    }
    current = current[part];
  }
  return typeof current === "string" ? current : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const saved = window.localStorage.getItem(LOCALE_KEY);
  if (saved === "ar" || saved === "en") return saved;
  const browser = window.navigator.language.toLowerCase();
  return browser.startsWith("ar") ? "ar" : "en";
}

export function I18nProvider({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState<Locale>(detectLocale);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LOCALE_KEY, locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.body.lang = locale;
    document.body.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      direction: locale === "ar" ? "rtl" : "ltr",
      isRtl: locale === "ar",
      setLocale,
      t: (key, fallback, params) => {
        const lookup = getNested(dictionary[locale], key) ?? getNested(dictionary.en, key);
        const base = lookup ?? fallback ?? key;
        return interpolate(base, params);
      },
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
