import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/site";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: "Complete New Homeowner System | A Clear Plan After Closing",
  description:
    "Your home did not come with an owner’s manual. Get a clear plan for the work that matters after closing, from setup and maintenance to records, repairs, and projects.",
  applicationName: "The Complete New Homeowner System",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Homeowner System",
  },
};

export const viewport: Viewport = {
  themeColor: "#f4ebdd",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <footer className="site-footer px-4 py-8 text-sm sm:px-6">
          <div className="mx-auto flex max-w-4xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-medium">
                The Complete New Homeowner System
              </p>
              <a
                className="footer-link mt-2 inline-block underline underline-offset-4 focus:outline-none focus:ring-2"
                href={SUPPORT_MAILTO}
              >
                {SUPPORT_EMAIL}
              </a>
            </div>
            <nav aria-label="Footer">
              <ul className="flex flex-wrap gap-x-5 gap-y-3">
                <li><Link className="footer-link underline underline-offset-4 focus:outline-none focus:ring-2" href="/delivery">Delivery</Link></li>
                <li><Link className="footer-link underline underline-offset-4 focus:outline-none focus:ring-2" href="/refunds">Refunds</Link></li>
                <li><Link className="footer-link underline underline-offset-4 focus:outline-none focus:ring-2" href="/privacy">Privacy</Link></li>
                <li><Link className="footer-link underline underline-offset-4 focus:outline-none focus:ring-2" href="/terms">Terms</Link></li>
                <li><Link className="footer-link underline underline-offset-4 focus:outline-none focus:ring-2" href="/support">Support</Link></li>
              </ul>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
