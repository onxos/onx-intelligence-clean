"use client";

import Link from "next/link";
import { AuthRegisterForm } from "@/components/auth-register-form";
import { useI18n } from "@/lib/i18n";

export default function RegisterPage() {
  const { t, direction } = useI18n();

  return (
    <div dir={direction} className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#d7e4f0_0,#f3f6f8_45%,#f8fafc_100%)] p-4">
      <div className="w-full max-w-md space-y-4">
        <p className="text-center text-xs uppercase tracking-[0.2em] text-slate-600">{t("brand.workspace")}</p>
        <AuthRegisterForm />
        <p className="text-center text-sm text-slate-600">
          {t("common.alreadyRegistered")} <Link href="/login" className="font-semibold text-slate-900">{t("common.login")}</Link>
        </p>
      </div>
    </div>
  );
}
