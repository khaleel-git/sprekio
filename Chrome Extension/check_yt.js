const fs = require('fs');

async function check() {
  const res = await fetch('https://www.youtube.com/watch?v=sBvngg879-8');
  const text = await res.text();
  
  const match = text.match(/"captionTracks":(\[.*?\])/);
  if (match) {
    console.log("Found captionTracks!", match[1].substring(0, 100));
  } else {
    console.log("No captionTracks regex match found!");
    // check ytInitialPlayerResponse
    const playerResponseMatch = text.match(/ytInitialPlayerResponse\s*=\s*({.*?});/);
    if (playerResponseMatch) {
      console.log("Found ytInitialPlayerResponse, length:", playerResponseMatch[1].length);
    } else {
      console.log("No ytInitialPlayerResponse found!");
    }
  }
}

check();
