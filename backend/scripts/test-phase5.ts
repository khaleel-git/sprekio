async function testBatch() {
  const start = performance.now();
  const res = await fetch('http://127.0.0.1:8787/api/dictionary/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
        words: ["Er", "zieht", "die", "Karte", "aus", "dem", "Stapel"], 
        sentence: "Er zieht die Karte aus dem Stapel." 
    })
  });
  const data = await res.json();
  const duration = performance.now() - start;
  
  console.log(`Time: ${Math.round(duration)}ms`);
  console.log(JSON.stringify(data, null, 2));
}

testBatch();
