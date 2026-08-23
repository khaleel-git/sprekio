fetch("https://sprekio-backend.khaleel-eu.workers.dev/api/translate-sentence", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text: "Guten Tag" })
})
.then(r => r.text())
.then(console.log)
.catch(console.error);
