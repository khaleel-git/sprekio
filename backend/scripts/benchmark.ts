async function runBenchmark() {
  const wordsList = [
    "ich", "du", "er", "sie", "es", "wir", "ihr", "und", "oder", "aber", // 10
    "ziehen", "gehen", "schlagen", "kaufen", "aufstehen", "abhängen", "freuen", "stehen", "machen", "tun", // +10 = 20
    "Haus", "Buch", "Auto", "Tisch", "Stuhl", // +5 = 25
    "schnell", "langsam", "gut", "schlecht", "schön", "hässlich", "groß", "klein", "hoch", "tief", // +10 = 35
    "in", "an", "auf", "für", "mit", "von", "aus", "bei", "nach", "zu", // +10 = 45
    "der", "die", "das", "ein", "eine" // +5 = 50
  ];

  // duplicate to get 100
  const maxWords = [...wordsList, ...wordsList.map(w => w + "s")];

  const sizes = [10, 25, 50, 100];
  
  console.log("====================================");
  console.log("  Phase 5 Batch API Benchmark       ");
  console.log("====================================");

  for (const size of sizes) {
     const words = maxWords.slice(0, size);
     
     // Warmup
     await fetch('http://127.0.0.1:8787/api/dictionary/batch', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ words, sentence: "This is a context sentence." })
     });

     const times = [];
     for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await fetch('http://127.0.0.1:8787/api/dictionary/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ words, sentence: "This is a context sentence." })
        });
        times.push(performance.now() - start);
     }

     times.sort((a, b) => a - b);
     const p50 = times[Math.floor(times.length * 0.5)];
     const p95 = times[Math.floor(times.length * 0.95)];
     const p99 = times[Math.floor(times.length * 0.99)];

     console.log(`\nBatch Size: ${size} words`);
     console.log(`P50: ${Math.round(p50)} ms`);
     console.log(`P95: ${Math.round(p95)} ms`);
     console.log(`P99: ${Math.round(p99)} ms`);
  }
}

runBenchmark();
