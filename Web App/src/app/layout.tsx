import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sprekio – Learn German Through Stories",
  description: "Learn German with AI-powered stories, grammar highlights, TTS audio, spaced repetition vocabulary, and community stories.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 min-h-screen`}>
        <Nav />
        <main className="max-w-5xl mx-auto px-4 py-6 pb-24">
          {children}
        </main>
        {/* Mobile bottom nav spacer */}
        <div className="h-16 md:hidden" />
      </body>
    </html>
  );
}
