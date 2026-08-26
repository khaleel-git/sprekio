async function testLookup(surface: string, sentence: string) {
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
  console.log(`Time: ${Math.round(duration)}ms`);
  
  if (data.status === 'not_found') {
    console.log(`❌ NO MATCH IN DICTIONARY`);
    return;
  }
  
  console.log(`Lexical Lemma: ${data.result.lemma.text}`);
  if (data.phraseMatch) {
    console.log(`✅ PHRASE FOUND: ${data.phraseMatch.lemma} (${data.phraseMatch.type})`);
  } else {
    console.log(`(No phrase detected)`);
  }
}

async function run() {
  console.log("Running Phase 3B E2E API Tests\n");

  await testLookup("freue", "Ich freue mich auf den Urlaub.");
  await testLookup("freue", "Ich freue mich über das Geschenk.");
  await testLookup("steht", "Er steht jeden Morgen um sieben Uhr auf.");
  
  // Negative cases
  await testLookup("freue", "Ich freue mich neben dem Tisch.");
  await testLookup("steht", "Er steht neben dem Tisch.");
  
  // Trigger phrase off verb, not noun
  await testLookup("habe", "Ich habe große Angst davor.");
  await testLookup("Angst", "Ich habe große Angst davor.");
}

run();
