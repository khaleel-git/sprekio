"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import YouTube from "react-youtube";
import { useSearchParams } from "next/navigation";
import { PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// Dummy data for related videos
const RELATED_VIDEOS = [
  { id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", channel: "Rick Astley" },
  { id: "jNQXAC9IVRw", title: "Me at the zoo", channel: "jawed" },
  { id: "W5Bscl7ALrE", title: "German Listening Practice", channel: "Easy German" },
];

function PlayerContent() {
  const searchParams = useSearchParams();
  const videoId = searchParams.get("v") || "";
  const [currentTime, setCurrentTime] = useState(0);
  const [transcript, setTranscript] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Poll video time
  const playerRef = useRef<any>(null);
  
  useEffect(() => {
    // We would fetch the transcript here. 
    // For now, we mock it.
    setTimeout(() => {
      setTranscript([
        { start: 1, end: 4, text: "Hallo und herzlich willkommen zu diesem Video." },
        { start: 4, end: 8, text: "Heute lernen wir Deutsch mit YouTube." },
        { start: 8, end: 12, text: "Das ist ein sehr gutes Werkzeug für alle." },
        { start: 12, end: 16, text: "Wir können die Untertitel auf der rechten Seite sehen." },
        { start: 16, end: 20, text: "Und wir können jedes Wort übersetzen!" },
      ]);
      setIsLoading(false);
    }, 1000);

    const interval = setInterval(() => {
      if (playerRef.current && playerRef.current.internalPlayer) {
        playerRef.current.internalPlayer.getCurrentTime().then((time: number) => {
          setCurrentTime(time);
        });
      }
    }, 500);
    return () => clearInterval(interval);
  }, [videoId]);

  const onReady = (e: any) => {
    playerRef.current = e.target;
  };

  const seekTo = (time: number) => {
    if (playerRef.current && playerRef.current.seekTo) {
      playerRef.current.seekTo(time);
    }
  };

  const activeIndex = transcript.findIndex(
    (t) => currentTime >= t.start && currentTime <= t.end
  );

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 pb-24 md:pb-8">
      <div className="flex flex-col lg:flex-row gap-6">
        
        {/* Left Column: Video & Related */}
        <div className="flex-1 min-w-0">
          {/* Video Player Container */}
          <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-sm mb-6 relative">
            <YouTube
              videoId={videoId}
              opts={{
                width: "100%",
                height: "100%",
                playerVars: {
                  autoplay: 1,
                  rel: 0,
                  modestbranding: 1,
                },
              }}
              onReady={onReady}
              className="absolute inset-0 w-full h-full"
              iframeClassName="w-full h-full border-none"
            />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-8">Video Title</h1>

          {/* Related Videos (Far Below) */}
          <div className="border-t border-gray-100 pt-8 mt-8">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Recent Related Videos</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {RELATED_VIDEOS.map((v) => (
                <div key={v.id} className="flex gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer border border-transparent hover:border-gray-100">
                  <div className="w-32 aspect-video bg-gray-200 rounded-lg overflow-hidden relative flex-shrink-0">
                    <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="Thumbnail" className="object-cover w-full h-full" />
                  </div>
                  <div className="flex flex-col">
                    <h3 className="font-medium text-gray-900 text-sm line-clamp-2">{v.title}</h3>
                    <p className="text-gray-500 text-xs mt-1">{v.channel}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Sticky CC */}
        <div className="w-full lg:w-[400px] flex-shrink-0">
          <div className="sticky top-20 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-120px)]">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between shrink-0">
              <h2 className="font-bold text-gray-900">Transcript</h2>
              <span className="text-xs font-medium text-gray-500 bg-white px-2 py-1 rounded border border-gray-200 shadow-sm">
                CC
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2 relative scroll-smooth">
              {isLoading ? (
                <div className="text-center text-gray-400 py-10">Loading captions...</div>
              ) : (
                transcript.map((line, i) => {
                  const isActive = i === activeIndex;
                  return (
                    <div
                      key={i}
                      onClick={() => seekTo(line.start)}
                      className={cn(
                        "p-3 rounded-xl cursor-pointer transition-colors text-[15px] leading-relaxed",
                        isActive 
                          ? "bg-blue-50 text-blue-900 font-medium" 
                          : "hover:bg-gray-50 text-gray-700"
                      )}
                    >
                      {line.text}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}

export default function WatchPlayerPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PlayerContent />
    </Suspense>
  );
}
