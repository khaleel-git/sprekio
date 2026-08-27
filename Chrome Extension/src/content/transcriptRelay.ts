/**
 * transcriptRelay.ts — runs only inside an embedded YouTube iframe (e.g. the
 * IFrame API player on sprekio.khaleel.eu/watch/player), never on a real
 * top-level youtube.com visit, where content/index.tsx's own dual-subtitle UI
 * already owns transcript fetching. Two fetchers racing on the same page would
 * just double the native-player CC toggling and duplicate work.
 *
 * Why this exists at all: a blind background-script fetch of a caption track's
 * baseUrl comes back with an empty body — modern YouTube caption URLs carry a
 * session-bound signature/token that only a real page's own request receives.
 * interceptor.ts (MAIN world) already captures the native player's own signed
 * request/response; this script waits for that, then relays the transcript up
 * to the parent frame directly via postMessage, since window.parent here *is*
 * the sprekio.khaleel.eu page — no chrome.runtime/background hop needed.
 */
if (window.self !== window.top) {
  const ALLOWED_PARENT_ORIGINS = [
    "https://sprekio.khaleel.eu",
    "http://localhost:3000",
  ];

  const videoId = new URLSearchParams(window.location.search).get("v");

  const send = (payload: Record<string, unknown>) => {
    for (const origin of ALLOWED_PARENT_ORIGINS) {
      try {
        window.parent.postMessage({ type: "SPREKIO_IFRAME_TRANSCRIPT", videoId, ...payload }, origin);
      } catch {
        // Wrong-origin postMessage calls throw in some browsers — the other
        // allowed origins still get their attempt.
      }
    }
  };

  const getEarlyBuffer = (): { url: string; text: string; status: number }[] =>
    (window as any).__sprekioEarlyBuffer || [];

  async function run() {
    if (!videoId) return;

    // Force CC on so the native player actually issues a caption request for
    // the interceptor to catch — the button may not exist yet if the player
    // chrome hasn't finished rendering, so poll briefly rather than once.
    const deadline = Date.now() + 8000;
    let ccButton: HTMLButtonElement | null = null;
    while (Date.now() < deadline && !ccButton) {
      ccButton = document.querySelector(".ytp-subtitles-button");
      if (!ccButton) await new Promise((r) => setTimeout(r, 200));
    }
    if (ccButton && ccButton.getAttribute("aria-pressed") !== "true") {
      ccButton.click();
    }

    // Poll the early buffer (populated by earlyBuffer.ts from document_start,
    // fed by interceptor.ts in the MAIN world) for the native player's own
    // successful caption response.
    let match: { url: string; text: string } | undefined;
    while (Date.now() < deadline) {
      match = getEarlyBuffer().find((t) => t.status === 200 && t.text && t.text.length > 30);
      if (match) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    if (!match) {
      send({ error: "No caption request observed from the embedded player (captions may be off or unavailable for this video)." });
      return;
    }

    send({ xml: match.text });
  }

  run();
}
