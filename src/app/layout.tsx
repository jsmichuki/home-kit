import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: "The Complete New Homeowner System",
  description:
    "A practical system for setting up, maintaining, protecting, budgeting, and improving your home.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <footer className="border-t border-stone-200 bg-white px-4 py-8 text-sm text-stone-700 sm:px-6">
          <div className="mx-auto flex max-w-4xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-medium text-stone-950">
                The Complete New Homeowner System
              </p>
              <a
                className="mt-2 inline-block underline underline-offset-4 hover:text-stone-950 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2"
                href={SUPPORT_MAILTO}
              >
                {SUPPORT_EMAIL}
              </a>
            </div>
            <nav aria-label="Footer">
              <ul className="flex flex-wrap gap-x-5 gap-y-3">
                <li><Link className="underline underline-offset-4 hover:text-stone-950 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2" href="/delivery">Delivery</Link></li>
                <li><Link className="underline underline-offset-4 hover:text-stone-950 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2" href="/refunds">Refunds</Link></li>
                <li><Link className="underline underline-offset-4 hover:text-stone-950 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2" href="/privacy">Privacy</Link></li>
                <li><Link className="underline underline-offset-4 hover:text-stone-950 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2" href="/terms">Terms</Link></li>
                <li><Link className="underline underline-offset-4 hover:text-stone-950 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2" href="/support">Support</Link></li>
              </ul>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
