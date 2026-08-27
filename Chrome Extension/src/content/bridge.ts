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
      respond(response);
    });
  } catch (err: any) {
    respond({ error: `Extension bridge disconnected: ${err?.message || err}. Reload this page to reconnect.` });
  }
});
