export async function onRequest(context: any) {
  try {
    const { searchParams } = new URL(context.request.url);
    const v = searchParams.get('v');
    if (!v) throw new Error("No video ID");
    
    // Simplest transcript fetching logic
    const res = await fetch('https://www.youtube.com/watch?v=' + v, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
    });
    const text = await res.text();
    
    const captionsMatch = text.match(/"captionTracks":(\[.*?\])/);
    if (!captionsMatch) throw new Error("No captions found");
    
    const tracks = JSON.parse(captionsMatch[1]);
    const track = tracks.find((t: any) => t.languageCode === 'de') || tracks[0];
    
    if (!track) throw new Error("No track found");
    
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
