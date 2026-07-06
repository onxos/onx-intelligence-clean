import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";

function getOAuthUrl() {
  const appID = import.meta.env.VITE_APP_ID;
  const redirectUri = window.location.origin + "/api/oauth/callback";
  const state = btoa(redirectUri);
  const authUrl = import.meta.env.VITE_KIMI_AUTH_URL || "https://auth.kimi.com";
  const url = new URL(authUrl + "/oauth/authorize");
  url.searchParams.set("client_id", appID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "profile");
  url.searchParams.set("state", state);
  return url.toString();
}

export function Login() {
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("error")) setError(params.get("error") || "فشل تسجيل الدخول");
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-emerald-50" dir="rtl">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-center text-2xl font-bold text-amber-900">تسجيل الدخول إلى ONX</h1>
          <p className="mt-2 text-center text-sm text-gray-600">
            نظام الذكاء الحضاري الدستوري
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <Button
            onClick={() => { window.location.href = getOAuthUrl(); }}
            className="w-full py-3 text-base"
          >
            الدخول عبر Kimi OAuth
          </Button>
          <p className="text-center text-xs text-gray-500">
            بالدخول، توافق على مبادئ ONX الدستورية: الأمانة، الإحسان، العدل، الرحمة، الحكمة، الإتقان، والتوكل
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
