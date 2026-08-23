export interface Subtitle {
  start: number;
  dur: number;
  end: number;
  text: string;
}

/**
 * Grabs the hidden subtitle tracks by asking the background script to run
 * a fetch inside the YouTube MAIN world, bypassing all CORS and anti-bot measures.
 */
export async function getYouTubeSubtitles(): Promise<Subtitle[]> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "getCaptionsViaScripting" },
      (response) => {
        if (!response || response.error || !response.data?.events) {
          console.warn("Sprekio: Subtitles fetch failed or none available.", response?.error);
          resolve([]);
          return;
        }

        const subtitles = response.data.events
          .filter((e: any) => e.segs && e.segs.length > 0)
          .map((e: any) => ({
            start: e.tStartMs / 1000,
            dur: (e.dDurationMs || 0) / 1000,
            end: (e.tStartMs + (e.dDurationMs || 0)) / 1000,
            text: e.segs.map((s: any) => s.utf8).join('').replace(/\n/g, ' ').trim(),
          }))
          .filter((sub: any) => sub.text.length > 0);

        resolve(subtitles);
      }
    );
  });
}

