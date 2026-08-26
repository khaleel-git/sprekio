async function testLookup(word: string) {
  const start = performance.now();
  const res = await fetch('http://127.0.0.1:8787/api/translate-word', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word })
  });
  const data = await res.json();
  const duration = performance.now() - start;
  
  console.log(`\n--- Test: ${word} (${Math.round(duration)}ms) ---`);
  console.log(JSON.stringify(data, null, 2));
}

async function run() {
  console.log("Starting Phase 3A Tests...");

  console.log("\n1. Surface casing / Unicode normalizations:");
  await testLookup("Häuser");
  await testLookup("häuser");
  await testLookup("HÄUSER");

  console.log("\n2. Morphological Identity checks:");
  await testLookup("ging");
  await testLookup("gingen");
  await testLookup("gegangen");
}

run();
