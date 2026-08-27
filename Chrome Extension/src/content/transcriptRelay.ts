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
console.log("[Sprekio Relay] transcriptRelay.ts loaded. In iframe:", window.self !== window.top, "URL:", window.location.href);

if (window.self !== window.top) {
  const ALLOWED_PARENT_ORIGINS = [
    "https://sprekio.khaleel.eu",
    "http://localhost:3000",
  ];

  const videoId = new URLSearchParams(window.location.search).get("v");
  console.log("[Sprekio Relay] Running inside iframe for videoId:", videoId);

  const send = (payload: Record<string, unknown>) => {
    console.log("[Sprekio Relay] Sending to parent:", payload);
    for (const origin of ALLOWED_PARENT_ORIGINS) {
      try {
        window.parent.postMessage({ type: "SPREKIO_IFRAME_TRANSCRIPT", videoId, ...payload }, origin);
      } catch (e) {
        console.warn("[Sprekio Relay] postMessage to", origin, "failed:", e);
      }
    }
  };

  const getEarlyBuffer = (): { url: string; text: string; status: number }[] =>
    (window as any).__sprekioEarlyBuffer || [];

  async function run() {
    if (!videoId) {
      console.warn("[Sprekio Relay] No videoId in iframe URL, aborting.");
      return;
    }

    // Force CC on so the native player actually issues a caption request for
    // the interceptor to catch — the button may not exist yet if the player
    // chrome hasn't finished rendering, so poll briefly rather than once.
    const deadline = Date.now() + 8000;
    let ccButton: HTMLButtonElement | null = null;
    while (Date.now() < deadline && !ccButton) {
      ccButton = document.querySelector(".ytp-subtitles-button");
      if (!ccButton) await new Promise((r) => setTimeout(r, 200));
    }
    if (!ccButton) {
      console.warn("[Sprekio Relay] .ytp-subtitles-button never appeared in the player DOM.");
    } else {
      console.log("[Sprekio Relay] Found CC button, aria-pressed:", ccButton.getAttribute("aria-pressed"));
      if (ccButton.getAttribute("aria-pressed") !== "true") {
        ccButton.click();
        console.log("[Sprekio Relay] Clicked CC button to force captions on.");
      }
    }

    // Poll the early buffer (populated by earlyBuffer.ts from document_start,
    // fed by interceptor.ts in the MAIN world) for the native player's own
    // successful caption response.
    let match: { url: string; text: string } | undefined;
    while (Date.now() < deadline) {
      const buf = getEarlyBuffer();
      match = buf.find((t) => t.status === 200 && t.text && t.text.length > 30);
      if (match) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    if (!match) {
      console.warn("[Sprekio Relay] Timed out with no intercepted caption response. Buffer contents:", getEarlyBuffer());
      send({ error: "No caption request observed from the embedded player (captions may be off or unavailable for this video)." });
      return;
    }

    console.log("[Sprekio Relay] Found intercepted caption response:", match.url, "length:", match.text.length);
    send({ xml: match.text });
  }

  run();
}
