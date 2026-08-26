async function runFinalTests() {
  const tests = [
    { word: "Haus", ctx: "Ich sehe ein Haus." },
    { word: "Häuser", ctx: "Dort sind viele Häuser." },
    { word: "ging", ctx: "Er ging nach Hause." },
    { word: "gegangen", ctx: "Er ist nach Hause gegangen." },
    { word: "größeren", ctx: "Wir brauchen einen größeren Wagen." },
    { word: "Wahrscheinlichkeitsrechnung", ctx: "Das ist Wahrscheinlichkeitsrechnung." },
    { word: "ziehen", ctx: "Wir ziehen nächstes Jahr nach Berlin." },
    { word: "ziehen", ctx: "Er zieht den Wagen über den Hof." },
    { word: "ziehen", ctx: "Der Zahnarzt wird den Zahn ziehen." },
    { word: "freuen", ctx: "Ich würde mich sehr auf deinen Besuch freuen." },
    { word: "aufstehen", ctx: "Er muss sehr früh aufstehen." },
    { word: "einkaufen", ctx: "Wir gehen morgen einkaufen." },
    { word: "jabberwocky", ctx: "Das ist ein jabberwocky." }
  ];

  for (const t of tests) {
     const res = await fetch('http://127.0.0.1:8787/api/translate-word', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: t.word, contextSentence: t.ctx, provider: "nvidia" })
     });
     const data = await res.json();
     if (!data.result) {
       console.log(`Word: ${t.word.padEnd(15)} | ERROR: ${JSON.stringify(data)}`);
     } else {
       console.log(`Word: ${t.word.padEnd(15)} | Res: ${data.result?.resolution?.padEnd(10)} | Trans: ${data.result?.translations?.[0]?.text}`);
     }
  }
}

runFinalTests();
