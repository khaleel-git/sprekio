import { PhraseDetector } from '../src/dictionary/PhraseDetector';
import { LexicalResult } from '../src/dictionary/types';

const detector = new PhraseDetector();

function testCase(name: string, surface: string, lemma: string, sentence: string) {
  console.log(`\n--- Test: ${name} ---`);
  console.log(`Sentence: "${sentence}"`);
  console.log(`Hover: ${surface} (lemma: ${lemma})`);
  
  const lexical: LexicalResult = {
    surface,
    normalized: surface.toLowerCase(),
    lemma: { id: "mock", text: lemma, partOfSpeech: "verb" },
    senses: []
  };

  const result = detector.detect(lexical, sentence);
  if (result) {
    console.log(`✅ MATCH: ${result.lemma} (${result.type})`);
    console.log(`   Tokens: [${result.matchedTokens.join(', ')}]`);
  } else {
    console.log(`❌ NO MATCH`);
  }
}

console.log("Running Phase 3B Phrase Detection Tests\n");

testCase("Positive: Phrase", "freue", "freuen", "Ich freue mich auf den Urlaub.");
testCase("Positive: Phrase 2", "freue", "freuen", "Ich freue mich über das Geschenk.");
testCase("Negative: Wrong preposition", "freue", "freuen", "Ich freue mich neben dem Tisch.");
testCase("Negative: Missing preposition", "freue", "freuen", "Ich freue den Tisch.");

testCase("Positive: Separable verb", "steht", "stehen", "Er steht jeden Morgen um sieben Uhr auf.");
testCase("Negative: Separable verb missing prefix", "steht", "stehen", "Er steht neben dem Tisch.");

testCase("Positive: Collocation noun", "Angst", "Angst", "Ich habe große Angst davor.");
testCase("Positive: Collocation verb", "habe", "haben", "Ich habe große Angst davor.");
