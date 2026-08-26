# Sprekio Evaluation Suite

This directory contains the tools to quantitatively evaluate the Sprekio Contextual Vocabulary Engine.

## Files
- `german-youtube.jsonl`: A golden dataset of manually verified German sentences representing common YouTube vocabulary lookups.
- `run.ts`: The runner script that sends each test case to the Cloudflare Worker and evaluates the response.
- `report.json`: The generated report detailing accuracy, latency, AI avoidance rate, and false positive rates.

## How to run
1. Start the local worker in another terminal:
   ```bash
   npx wrangler dev
   ```
2. Run the evaluation suite:
   ```bash
   npx tsx dictionary/evaluation/run.ts
   ```

## Key Metrics
- **Correctness**: Whether the resolved lemma and selected translation match the expected values.
- **AI Avoidance**: The percentage of lookups that were resolved deterministically via the phrase/contextual ranking engine, without falling back to Gemini.
- **False Positives**: The number of times the Phrase Detector incorrectly claimed a phrase match (e.g. triggering `aufstehen` on "Er steht auf dem Tisch" because both 'auf' and 'stehen' are present).
- **Latency**: End-to-end lookup latency by resolution path (IndexedDB, Contextual, AI Cache, AI).
