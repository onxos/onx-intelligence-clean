import Link from "next/link";
import { AuthLoginForm } from "@/components/auth-login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#d7e4f0_0,#f3f6f8_45%,#f8fafc_100%)] p-4">
      <div className="w-full max-w-md space-y-4">
        <p className="text-center text-xs uppercase tracking-[0.2em] text-slate-600">ONX Intelligence Workspace</p>
        <AuthLoginForm />
        <p className="text-center text-sm text-slate-600">
          No account? <Link href="/register" className="font-semibold text-slate-900">Register</Link>
        </p>
      </div>
    </div>
  );
}
