async function testLookup(surface: string, sentence: string) {
  const start = performance.now();
  const res = await fetch('http://127.0.0.1:8787/api/translate-word', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word: surface, contextSentence: sentence, apiKey: 'mock' })
  });
  const data = await res.json();
  const duration = performance.now() - start;
  
  console.log(`\n--- Test: ${surface} ---`);
  console.log(`Sentence: "${sentence}"`);
  console.log(`Time: ${Math.round(duration)}ms`);
  
  if (data.status === 'not_found') {
    console.log(`❌ NO MATCH IN DICTIONARY`);
    return;
  }

  const result = data.result;
  const topTranslation = result.translations[0];
  console.log(`Resolution: ${result.resolution}`);
  console.log(`Lemma: ${result.lemma}`);
  console.log(`Selected By: ${topTranslation.selectedBy}`);
  console.log(`Top Translation: "${topTranslation.text}"${topTranslation.score !== undefined ? ` (Score: ${topTranslation.score.toFixed(2)})` : ''}`);
  if (topTranslation.aiReason) {
    console.log(`AI Reason: ${topTranslation.aiReason}`);
  } else {
    console.log(`Evidence:`, topTranslation.evidence.map((e:any) => e.rule).join(', '));
  }
}

async function run() {
  console.log("Running Phase 3D AI Fallback Tests\n");

  // This should trigger AI because we have no deterministic rule for "Karte"
  await testLookup("zieht", "Er zieht eine Karte aus dem Stapel.");
  
  // This should be an AI cache hit because we just ran it!
  await testLookup("zieht", "Er zieht eine Karte aus dem Stapel.");

  // This should be deterministic Contextual
  await testLookup("zieht", "Der Arzt zieht den Zahn.");
}

run();
