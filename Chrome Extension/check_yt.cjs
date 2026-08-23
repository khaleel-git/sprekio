const fs = require('fs');

async function check() {
  const res = await fetch('https://www.youtube.com/watch?v=2BT_TNb3Re0');
  const text = await res.text();
  
  const match = text.match(/"captionTracks":\s*(\[.*?\])/);
  if (match) {
    try {
      const tracks = JSON.parse(match[1]);
      const manualTrack = tracks.find(t => t.kind !== 'asr') || tracks[0];
      const targetTrack = manualTrack;
      console.log("Track Object:", JSON.stringify(targetTrack, null, 2));
      const subRes = await fetch(targetTrack.baseUrl + "&fmt=json3", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "X-YouTube-Client-Name": "1",
          "X-YouTube-Client-Version": "2.20240101.01.00"
        }
      });
      console.log("Status:", subRes.status);
      const subText = await subRes.text();
      console.log("Raw Subtitle Response Length:", subText.length);
      console.log("First 100 chars:", subText.substring(0, 100));
    } catch (e) {
      console.log("Failed:", e.message);
    }
  }
}
check();
