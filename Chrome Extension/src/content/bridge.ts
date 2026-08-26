// Custom event listener for the Web App to fetch transcripts via the extension
const processedReqIds = new Set<string>();
window.addEventListener('SPREKIO_FETCH_TRANSCRIPT', (e: any) => {
  const { videoId, reqId } = e.detail;
  if (processedReqIds.has(reqId)) return;
  processedReqIds.add(reqId);
  
  chrome.runtime.sendMessage({ action: 'fetchTranscriptDirect', videoId }, (response) => {
    window.dispatchEvent(new CustomEvent('SPREKIO_TRANSCRIPT_RESULT', {
      detail: { reqId, response }
    }));
  });
});
