import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sprekio - Learn German Through Stories",
  description: "Learn German with AI-powered stories, grammar highlights, TTS audio, spaced repetition vocabulary, and community stories.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 min-h-screen flex flex-col md:flex-row`}>
        <Nav />
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 md:pl-72 md:py-10 pb-24 md:pb-10">
          {children}
        </main>
      </body>
    </html>
  );
}
