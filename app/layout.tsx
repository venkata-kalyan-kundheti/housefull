import type { Metadata } from "next";
import Link from "next/link";
import { DataBadges } from "@/components/DataBadges";
import "./globals.css";

export const metadata: Metadata = {
  title: "Housefull | Cinema Audience Discovery",
  description: "AI agent for cinema managers that uses the Qloo taste graph to find audiences for underfilled shows.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full bg-white text-zinc-900">
      <body className="min-h-full flex flex-col antialiased">
        <header className="border-b border-zinc-200 bg-white">
          <div className="max-w-[1100px] mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Link href="/" className="font-bold text-xl tracking-tight text-zinc-950">
                Housefull
              </Link>
              <nav className="flex items-center gap-4 text-sm font-medium">
                <Link href="/" className="text-zinc-600 hover:text-zinc-950">
                  Schedule
                </Link>
                <Link href="/about" className="text-zinc-600 hover:text-zinc-950">
                  About
                </Link>
              </nav>
            </div>
            <div id="data-badges-container" className="flex items-center gap-2">
              <DataBadges />
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-[1100px] w-full mx-auto px-4 py-8">
          {children}
        </main>

        <footer className="border-t border-zinc-200 bg-zinc-50 py-6 text-center text-xs text-zinc-500">
          <div className="max-w-[1100px] mx-auto px-4">
            Taste data from Qloo. Showtimes in this demo are simulated.
          </div>
        </footer>
      </body>
    </html>
  );
}
