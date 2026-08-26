if (!(window as any).__sprekioInterceptor) {
  (window as any).__sprekioInterceptor = true;
  // Buffer for SPREKIO_INTERCEPTED messages that arrive before React mounts and
  // registers its window.addEventListener. The content script drains this on mount.
  (window as any).__sprekioBuffer = (window as any).__sprekioBuffer || [];

  console.log("[Sprekio Interceptor] Installed in MAIN world at document_start");

  const originalFetch = window.fetch;
  window.fetch = async function(...args: any[]) {
    let urlStr = '';
    if (typeof args[0] === 'string') urlStr = args[0];
    else if (args[0] instanceof Request) urlStr = args[0].url;
    else if (args[0] && typeof args[0].toString === 'function') urlStr = args[0].toString();
    
    if (urlStr.includes('/api/timedtext') || urlStr.includes('youtubei/v1/get_transcript')) {
      console.log("[Sprekio Interceptor] Caught native fetch:", urlStr);
      try {
        const response = await originalFetch.apply(this, args as any);
        const clone = response.clone();
        clone.text().then(text => {
          const msg = { 
            type: 'SPREKIO_INTERCEPTED', 
            url: urlStr, 
            text, 
            status: response.status,
            headers: [...response.headers.entries()]
          };
          (window as any).__sprekioBuffer.push(msg);
          window.postMessage(msg, '*');
        }).catch(e => console.error("[Sprekio Interceptor] clone error", e));
        return response;
      } catch(e) {
        return originalFetch.apply(this, args as any);
      }
    }
    return originalFetch.apply(this, args as any);
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...rest: any[]) {
    const urlStr = typeof url === 'string' ? url : url.href;
    if (urlStr.includes('/api/timedtext') || urlStr.includes('youtubei/v1/get_transcript')) {
      console.log("[Sprekio Interceptor] Caught native XHR:", urlStr);
      this.addEventListener('load', function(this: XMLHttpRequest) {
        const msg = { 
          type: 'SPREKIO_INTERCEPTED', 
          url: urlStr, 
          text: this.responseText, 
          status: this.status 
        };
        (window as any).__sprekioBuffer.push(msg);
        window.postMessage(msg, '*');
      });
    }
    return (originalOpen as any).call(this, method, url, ...rest);
  };
}
