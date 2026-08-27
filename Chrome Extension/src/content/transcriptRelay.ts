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

  // The embedded player (react-youtube/IFrame API) loads /embed/<videoId>?params —
  // the video id is in the path, not a ?v= query param like a normal watch page.
  const embedMatch = window.location.pathname.match(/\/embed\/([^/?]+)/);
  const videoId = embedMatch?.[1] || new URLSearchParams(window.location.search).get("v");
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

  interface Line { text: string; start: number; duration: number }

  // The native player requests captions in one of two shapes depending on which
  // format it asked for (json3 vs classic XML) — normalize both to the same
  // {text, start, duration}[] (ms) shape here so the parent page never has to
  // sniff formats. json3 events carry per-segment text under e.segs[].utf8.
  function parseJson3(text: string): Line[] {
    const data = JSON.parse(text);
    return (data.events || [])
      .filter((e: any) => e.segs)
      .map((e: any) => ({
        text: (e.segs || []).map((s: any) => s.utf8 || "").join("").replace(/\n/g, " ").trim(),
        start: e.tStartMs || 0,
        duration: e.dDurationMs || 2000,
      }))
      .filter((e: Line) => e.text.length > 0);
  }

  function parseXml(xml: string): Line[] {
    const decode = (t: string) => t
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'");

    // Classic format: <text start="s" dur="s">text</text>
    const results: Line[] = [];
    const classicRe = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
    let m: RegExpExecArray | null;
    while ((m = classicRe.exec(xml)) !== null) {
      const text = decode(m[3]).trim();
      if (text) results.push({ text, start: parseFloat(m[1]) * 1000, duration: parseFloat(m[2]) * 1000 });
    }
    if (results.length > 0) return results;

    // Newer srv3-style format: <p t="ms" d="ms"><s>text</s></p>
    const pRe = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
    while ((m = pRe.exec(xml)) !== null) {
      const inner = m[3];
      let text = "";
      const sRe = /<s[^>]*>([^<]*)<\/s>/g;
      let sMatch: RegExpExecArray | null;
      while ((sMatch = sRe.exec(inner)) !== null) text += sMatch[1];
      if (!text) text = inner.replace(/<[^>]+>/g, "");
      text = decode(text).trim();
      if (text) results.push({ text, start: parseInt(m[1], 10), duration: parseInt(m[2], 10) });
    }
    return results;
  }

  function parseTranscript(text: string): Line[] {
    try {
      return parseJson3(text);
    } catch {
      return parseXml(text);
    }
  }

  async function run() {
    if (!videoId) {
      console.warn("[Sprekio Relay] No videoId in iframe URL, aborting.");
      return;
    }

    // Force CC on so the native player actually issues a caption request for
    // the interceptor to catch — the button may not exist yet if the player
    // chrome hasn't finished rendering, so poll briefly rather than once. This
    // gets its own short budget: on the "WEB_EMBEDDED_PLAYER" client the CC
    // button frequently never appears in the DOM at all, and previously this
    // search shared one deadline with the buffer-poll loop below, so burning
    // the whole window here left that loop zero time to ever actually poll.
    const buttonDeadline = Date.now() + 3000;
    let ccButton: HTMLButtonElement | null = null;
    while (Date.now() < buttonDeadline && !ccButton) {
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
    // successful caption response. Measured live: the native player's first
    // caption request is frequently aborted (net::ERR_ABORTED) and only a
    // later retry succeeds, sometimes 10+ seconds in — so this needs real
    // headroom, independent of whatever the button search above used.
    const bufferDeadline = Date.now() + 20000;
    let match: { url: string; text: string } | undefined;
    while (Date.now() < bufferDeadline) {
      const buf = getEarlyBuffer();
      match = buf.find((t) => t.status === 200 && t.text && t.text.length > 30);
      if (match) break;
      await new Promise((r) => setTimeout(r, 300));
    }

    if (!match) {
      console.warn("[Sprekio Relay] Timed out with no intercepted caption response. Buffer contents:", getEarlyBuffer());
      send({ error: "No caption request observed from the embedded player (captions may be off or unavailable for this video)." });
      return;
    }

    console.log("[Sprekio Relay] Found intercepted caption response:", match.url, "length:", match.text.length);
    const lines = parseTranscript(match.text);
    console.log("[Sprekio Relay] Parsed", lines.length, "transcript lines.");
    if (lines.length === 0) {
      send({ error: "Caption response was received but contained no usable text (unrecognized format or empty track)." });
      return;
    }
    send({ lines });
  }

  run();
}
