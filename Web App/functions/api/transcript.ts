export async function onRequest(context: any) {
  try {
    const { searchParams } = new URL(context.request.url);
    const v = searchParams.get('v');
    if (!v) throw new Error("No video ID");
    
    // Use the InnerTube API to reliably fetch transcript info
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            context: { client: { clientName: "ANDROID", clientVersion: "20.10.38" } },
            videoId: v
        })
    });
    
    if (!res.ok) throw new Error("Failed to fetch player data");
    
    const data = await res.json();
    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    
    if (!tracks || tracks.length === 0) {
        throw new Error("No captions found for this video. Raw data: " + JSON.stringify(data).slice(0, 500));
    }
    
    const track = tracks.find((t: any) => t.languageCode === 'de') || tracks[0];
    const xmlRes = await fetch(track.baseUrl);
    const xml = await xmlRes.text();
    
    return new Response(xml, { 
        status: 200, 
        headers: { 'Content-Type': 'application/xml' } 
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' } 
    });
  }
}
