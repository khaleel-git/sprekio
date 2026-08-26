async function testLookup(surface: string, sentence: string, expectedPattern?: string) {
  const start = performance.now();
  const res = await fetch('http://127.0.0.1:8787/api/translate-word', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word: surface, contextSentence: sentence })
  });
  const data = await res.json();
  const duration = performance.now() - start;
  
  console.log(`\n--- Test: ${surface} ---`);
  console.log(`Sentence: "${sentence}"`);
  
  if (data.status === 'not_found') {
    console.log(`❌ NO MATCH IN DICTIONARY`);
    return;
  }

  const result = data.result;
  const topTranslation = result.translations[0];
  console.log(`Lemma: ${result.lemma}`);
  console.log(`Top Translation: "${topTranslation.text}" (Score: ${topTranslation.score.toFixed(2)})`);
  console.log(`Evidence:`, topTranslation.evidence.map((e:any) => e.rule).join(', '));
  
  if (expectedPattern) {
    if (topTranslation.text.includes(expectedPattern)) {
      console.log(`✅ MATCHED EXPECTED PATTERN: ${expectedPattern}`);
    } else {
      console.log(`❌ FAILED EXPECTED PATTERN: ${expectedPattern}`);
    }
  }
}

async function run() {
  console.log("Running Phase 3C Contextual Ranking Tests\n");

  await testLookup("ziehen", "Wir ziehen nächstes Jahr nach Berlin.", "move");
  await testLookup("zieht", "Die Familie zieht nach Deutschland.", "move");
  await testLookup("zieht", "Er zieht den Wagen.", "pull");
  await testLookup("zieht", "Der Arzt zieht den Zahn.", "pull");
  await testLookup("zieht", "Sie zieht eine Linie.", "draw");

  await testLookup("steht", "Er steht früh auf.", "get up");
  await testLookup("steht", "Er steht neben dem Tisch.", "stand");

  await testLookup("freue", "Ich freue mich auf den Urlaub.", "look forward");
  await testLookup("freue", "Ich freue mich über das Geschenk.", "happy about");

  await testLookup("Angst", "Ich habe große Angst davor.", "be afraid");
}

run();
