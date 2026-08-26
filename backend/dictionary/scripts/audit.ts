import Database from 'better-sqlite3';
import { config } from '../config.ts';

const db = new Database(config.paths.db, { readonly: true });

function lookup(surface: string) {
  const normalized = surface.toLowerCase();
  
  // Lookup via forms index
  const forms = db.prepare('SELECT lemma_id, grammatical_info FROM forms WHERE normalized = ?').all(normalized) as any[];
  
  if (forms.length === 0) {
    console.log(`\n--- Lookup: ${surface} ---`);
    console.log(`❌ Not found`);
    return;
  }
  
  // Get unique lemma IDs
  const lemmaIds = Array.from(new Set(forms.map(f => f.lemma_id)));
  
  console.log(`\n--- Lookup: ${surface} ---`);
  
  for (const lemmaId of lemmaIds) {
    const lemma = db.prepare('SELECT lemma, part_of_speech, gender FROM lemmas WHERE id = ?').get(lemmaId) as any;
    const senses = db.prepare('SELECT translation FROM senses WHERE lemma_id = ?').all(lemmaId) as any[];
    
    // Group grammatical info from forms that matched this lemma
    const matchedForms = forms.filter(f => f.lemma_id === lemmaId).map(f => f.grammatical_info).join(' | ');
    
    console.log(`Lemma: ${lemma.lemma} (${lemma.part_of_speech}${lemma.gender ? ', ' + lemma.gender : ''}) [Form Info: ${matchedForms}]`);
    console.log(`Translations:`);
    senses.slice(0, 5).forEach((s, i) => {
      console.log(`  ${i+1}. ${s.translation}`);
    });
    if (senses.length > 5) console.log(`  ... and ${senses.length - 5} more.`);
  }
}

const wordsToTest = [
  "Haus", "Zeit", "Mensch", "Arbeit",
  "gehen", "kommen", "nehmen", "ziehen",
  "ging", "gegangen", "Häuser", "größeren",
  "stellen", "laufen", "halten",
  "Krankenhaus", "Wahrscheinlichkeitsrechnung"
];

for (const w of wordsToTest) {
  lookup(w);
}
