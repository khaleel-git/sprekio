/**
 * earlyBuffer.ts — runs in ISOLATED world at document_start on YouTube.
 *
 * The interceptor (MAIN world, document_start) catches native XHRs and calls
 * window.postMessage({type: 'SPREKIO_INTERCEPTED', ...}). But index.tsx only
 * mounts at document_idle, so those early messages are always missed.
 *
 * This script starts immediately and buffers every SPREKIO_INTERCEPTED message
 * into window.__sprekioEarlyBuffer (ISOLATED world). When React mounts, the
 * useEffect in index.tsx drains this buffer.
 */
(window as any).__sprekioEarlyBuffer = (window as any).__sprekioEarlyBuffer || [];

window.addEventListener('message', (e: MessageEvent) => {
  if (e.data && e.data.type === 'SPREKIO_INTERCEPTED') {
    const buf: any[] = (window as any).__sprekioEarlyBuffer;
    // Deduplicate by URL+status so a retried request's successful response isn't
    // dropped just because an earlier failed response for the same URL was buffered.
    if (!buf.some((m: any) => m.url === e.data.url && m.status === e.data.status)) {
      console.log('[Sprekio Early Buffer] Stored intercepted transcript:', e.data.url);
      buf.push(e.data);
    }
  }
});
