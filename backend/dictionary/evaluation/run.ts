import fs from 'fs';
import readline from 'readline';

interface TestCase {
  id: string;
  surface: string;
  sentence: string;
  expectedLemma: string;
  acceptableTranslations: string[];
  category: string;
}

interface TestResult {
  id: string;
  category: string;
  passed: boolean;
  actualLemma: string;
  actualTranslation: string;
  resolution: string;
  latencyMs: number;
  error?: string;
  aiAvoided: boolean;
  isFalsePositive: boolean;
}

async function runEvaluation() {
  console.log("Starting Evaluation Suite...\n");

  const fileStream = fs.createReadStream('dictionary/evaluation/german-youtube.jsonl');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const results: TestResult[] = [];
  
  for await (const line of rl) {
    if (!line.trim()) continue;
    const testCase: TestCase = JSON.parse(line);

    const start = performance.now();
    try {
      const res = await fetch('http://127.0.0.1:8787/api/translate-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: testCase.surface, contextSentence: testCase.sentence })
      });
      
      const duration = performance.now() - start;
      const data = await res.json();
      
      if (data.status === 'not_found') {
        results.push({
          id: testCase.id,
          category: testCase.category,
          passed: false,
          actualLemma: 'NOT_FOUND',
          actualTranslation: '',
          resolution: 'not_found',
          latencyMs: duration,
          aiAvoided: true,
          isFalsePositive: false
        });
        continue;
      }

      const result = data.result;
      const topTranslation = result.translations[0];
      const actualLemma = result.lemma;
      const actualTranslation = topTranslation.text.toLowerCase();
      
      const lemmaMatch = actualLemma === testCase.expectedLemma;
      const translationMatch = testCase.acceptableTranslations.some(t => actualTranslation.includes(t.toLowerCase()));
      
      const passed = lemmaMatch && translationMatch;
      
      let isFalsePositive = false;
      if (!lemmaMatch && result.phraseMatch && testCase.category === 'adversarial') {
         isFalsePositive = true;
      }

      const isAi = result.resolution === 'needs_ai' || result.resolution === 'ai' || result.resolution === 'ai_cache';

      results.push({
        id: testCase.id,
        category: testCase.category,
        passed,
        actualLemma,
        actualTranslation: topTranslation.text,
        resolution: result.resolution,
        latencyMs: duration,
        aiAvoided: !isAi,
        isFalsePositive
      });
      
    } catch (e: any) {
      results.push({
        id: testCase.id,
        category: testCase.category,
        passed: false,
        actualLemma: 'ERROR',
        actualTranslation: '',
        resolution: 'error',
        latencyMs: performance.now() - start,
        error: e.message,
        aiAvoided: false,
        isFalsePositive: false
      });
    }
  }

  // Generate Report
  generateReport(results);
}

function generateReport(results: TestResult[]) {
  const total = results.length;
  const passed = results.filter(r => r.passed && r.aiAvoided).length;
  
  // Deterministic Coverage = resolved correctly OR incorrectly deterministically, 
  // but if it returned needs_ai, it was an AI fallback
  const deterministicLookups = results.filter(r => r.aiAvoided && r.resolution !== 'not_found');
  const deterministicCount = deterministicLookups.length;
  const deterministicPassed = deterministicLookups.filter(r => r.passed).length;
  const deterministicCoverage = deterministicCount / total;
  const deterministicAccuracy = deterministicCount > 0 ? deterministicPassed / deterministicCount : 0;
  
  const falsePositives = results.filter(r => r.isFalsePositive).length;
  const aiFallbackRate = 1 - deterministicCoverage;
  
  console.log("==========================================");
  console.log("             SPREKIO EVALUATION           ");
  console.log("==========================================\n");
  
  console.log(`Total Lookups:          ${total}`);
  console.log(`Deterministic Coverage: ${(deterministicCoverage * 100).toFixed(1)}% (${deterministicCount}/${total})`);
  console.log(`Deterministic Accuracy: ${(deterministicAccuracy * 100).toFixed(1)}% (${deterministicPassed}/${deterministicCount})`);
  console.log(`AI Fallback Rate:       ${(aiFallbackRate * 100).toFixed(1)}%`);
  console.log(`False Positives:        ${falsePositives} detected\n`);
  
  console.log("--- Breakdown by Resolution ---");
  const byRes = results.reduce((acc, r) => {
     acc[r.resolution] = (acc[r.resolution] || 0) + 1;
     return acc;
  }, {} as Record<string, number>);
  Object.entries(byRes).forEach(([res, count]) => {
     console.log(`- ${res.padEnd(12)}: ${count}`);
  });

  console.log("\n--- Average Latency by Resolution ---");
  Object.keys(byRes).forEach(res => {
     const times = results.filter(r => r.resolution === res).map(r => r.latencyMs);
     const avg = times.reduce((a, b) => a + b, 0) / times.length;
     console.log(`- ${res.padEnd(12)}: ${Math.round(avg)}ms`);
  });

  console.log("\n--- Failures ---");
  const failures = results.filter(r => !r.passed || !r.aiAvoided);
  failures.forEach(f => {
    if (!f.aiAvoided) {
      console.log(`[${f.id}] Required AI fallback.`);
    } else {
      console.log(`[${f.id}] Deterministic engine failed.`);
    }
    console.log(`  Expected Category: ${f.category}`);
    console.log(`  Actual Lemma: ${f.actualLemma} | Actual Trans: "${f.actualTranslation}"`);
    if (f.isFalsePositive) console.log(`  -> ⚠️ FALSE POSITIVE DETECTED`);
  });
  
  const aiAvoidedCount = results.filter(r => r.aiAvoided && r.resolution !== 'not_found').length;
  fs.writeFileSync('dictionary/evaluation/report.json', JSON.stringify({ summary: { total, passed, aiAvoided: aiAvoidedCount, falsePositives }, results }, null, 2));
}

runEvaluation();
