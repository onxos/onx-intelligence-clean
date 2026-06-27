import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import type { ReactNode } from "react";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "ONX Intelligence Workspace",
  description: "Production workspace for ONX Intelligence",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const initDirectionScript = `(() => {
    try {
      const stored = window.localStorage.getItem('onx_workspace_locale');
      const locale = stored === 'ar' ? 'ar' : 'en';
      const direction = locale === 'ar' ? 'rtl' : 'ltr';
      document.documentElement.lang = locale;
      document.documentElement.dir = direction;
      if (document.body) {
        document.body.lang = locale;
        document.body.dir = direction;
      }
    } catch {
      document.documentElement.lang = 'en';
      document.documentElement.dir = 'ltr';
      if (document.body) {
        document.body.lang = 'en';
        document.body.dir = 'ltr';
      }
    }
  })();`;

  return (
    <html
      lang="en"
      dir="ltr"
      suppressHydrationWarning
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body lang="en" dir="ltr" className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: initDirectionScript }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
