// Custom event listener for the Web App to fetch transcripts via the extension
const processedReqIds = new Set<string>();
window.addEventListener('SPREKIO_FETCH_TRANSCRIPT', (e: any) => {
  const { videoId, reqId } = e.detail;
  if (processedReqIds.has(reqId)) return;
  processedReqIds.add(reqId);

  const respond = (response: any) => {
    window.dispatchEvent(new CustomEvent('SPREKIO_TRANSCRIPT_RESULT', {
      detail: { reqId, response }
    }));
  };

  // A stale content script (extension reloaded while this tab was already open)
  // makes chrome.runtime.* throw synchronously instead of ever calling back —
  // without this catch the web app just times out after 5s with no explanation.
  try {
    chrome.runtime.sendMessage({ action: 'fetchTranscriptDirect', videoId }, (response) => {
      if (chrome.runtime.lastError) {
        respond({ error: `Extension bridge disconnected (${chrome.runtime.lastError.message}). Reload this page to reconnect.` });
        return;
      }
      // The background handler always calls sendResponse with either {xml} or {error} —
      // a bare undefined here means the service worker never ran the handler at all
      // (e.g. it was asleep and didn't wake in time), which otherwise looked identical
      // to a real "no captions" response and got silently misrouted to the backend.
      if (!response) {
        respond({ error: "Extension background script did not respond. Try reloading the extension in chrome://extensions, then reload this page." });
        return;
      }
      respond(response);
    });
  } catch (err: any) {
    respond({ error: `Extension bridge disconnected: ${err?.message || err}. Reload this page to reconnect.` });
  }
});
