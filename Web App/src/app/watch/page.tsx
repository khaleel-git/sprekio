"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlayCircle, Search } from "lucide-react";

export default function WatchPage() {
  const [url, setUrl] = useState("");
  const router = useRouter();

  const handleWatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    
    // Extract video ID from URL
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
    } catch (e) {
      // Ignore invalid URL, assume it's an ID
    }

    if (videoId) {
      router.push(`/watch/${videoId}`);
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 pb-24 md:pb-8">
      <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm text-center">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <PlayCircle className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Watch & Learn</h1>
        <p className="text-gray-500 mb-8 max-w-md mx-auto">
          Paste a YouTube URL to watch it with interactive captions and learn vocabulary in context.
        </p>

        <form onSubmit={handleWatch} className="max-w-xl mx-auto relative flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste YouTube URL or Video ID..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors"
          >
            Watch
          </button>
        </form>
      </div>
    </main>
  );
}
