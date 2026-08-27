"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlayCircle, Search } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function WatchPage() {
  const [url, setUrl] = useState("");
  const router = useRouter();

  const handleWatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    let videoId = url;
    try {
      if (url.includes("youtube.com") || url.includes("youtu.be")) {
        const urlObj = new URL(url);
        if (urlObj.hostname.includes("youtu.be")) {
          videoId = urlObj.pathname.slice(1);
        } else {
          videoId = urlObj.searchParams.get("v") || url;
        }
      }
    } catch {
      // Not a valid URL — assume it's already a bare video ID
    }

    if (videoId) {
      router.push(`/watch/player?v=${videoId}`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Card className="p-8 md:p-10 text-center">
        <div className="w-16 h-16 bg-brand-light text-brand rounded-2xl flex items-center justify-center mx-auto mb-6">
          <PlayCircle className="w-8 h-8" />
        </div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold text-ink mb-2">Watch &amp; Learn</h1>
        <p className="text-ink/50 mb-8 max-w-md mx-auto">
          Paste a YouTube URL to watch it with interactive captions and learn vocabulary in context.
        </p>

        <form onSubmit={handleWatch} className="max-w-xl mx-auto flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink/30" />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste YouTube URL or Video ID..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-black/10 bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-all"
            />
          </div>
          <Button type="submit" size="lg">
            Watch
          </Button>
        </form>
      </Card>
    </div>
  );
}
