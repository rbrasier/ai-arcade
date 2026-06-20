import type { Metadata } from "next";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import {
  Bricolage_Grotesque,
  Hanken_Grotesk,
  Space_Mono,
} from "next/font/google";
import "./globals.css";

import { SiteLock } from "@/components/arcade/SiteLock";
import {
  SITE_AUTH_COOKIE,
  cookieUnlocks,
  getSitePassword,
} from "@/lib/site-auth";

// Arcade Hub display + body + label fonts. Exposed as CSS variables and wired
// into Tailwind tokens (see globals.css) so the home page can opt in without
// changing the default font on the rest of the app.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
});
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
});

export const metadata: Metadata = {
  title: "AI Arcade",
  description: "Learn AI by playing. A scaffolded arcade of teaching mini-games.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Show the password gate when `SITE_PASSWORD` is set and this visitor hasn't
  // unlocked yet. The proxy enforces the gate on the API; this is the UI.
  const locked = getSitePassword()
    ? !cookieUnlocks((await cookies()).get(SITE_AUTH_COOKIE)?.value)
    : false;

  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${bricolage.variable} ${hanken.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {locked && <SiteLock />}
      </body>
    </html>
  );
}
