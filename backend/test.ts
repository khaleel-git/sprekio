async function testLookup(word: string, context: string) {
  const start = performance.now();
  const res = await fetch('http://127.0.0.1:8787/api/translate-word', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, contextSentence: context, provider: 'gemini' })
  });
  const data = await res.json();
  const duration = performance.now() - start;
  
  console.log(`\n--- Test: ${word} (${Math.round(duration)}ms) ---`);
  // truncate translations for console output
  if (data.translations && data.translations.length > 5) {
     data.translations = [...data.translations.slice(0, 5), { text: `... and ${data.translations.length - 5} more` }];
  }
  console.log(JSON.stringify(data, null, 2));
}

async function run() {
  await testLookup("Häuser", "Es gibt viele Häuser.");
  await testLookup("größeren", "Einen größeren Apfel.");
  await testLookup("Straße", "Auf der Straße.");
  await testLookup("ziehen", "Wir ziehen um.");
  await testLookup("Wahrscheinlichkeitsrechnung", "Ich lerne Wahrscheinlichkeitsrechnung.");
}

run();
