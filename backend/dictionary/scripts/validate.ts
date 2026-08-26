import Database from 'better-sqlite3';
import { config } from '../config';
import fs from 'fs';

function validateDatabase() {
  if (!fs.existsSync(config.paths.db)) {
    console.error(`Database not found at ${config.paths.db}. Run build first.`);
    process.exit(1);
  }

  const db = new Database(config.paths.db, { readonly: true });
  console.log(`\nSprekio Dictionary Build Validation`);
  console.log(`-----------------------------------`);

  // Basic counts
  const lemmasCount = db.prepare('SELECT COUNT(*) as c FROM lemmas').get() as { c: number };
  const formsCount = db.prepare('SELECT COUNT(*) as c FROM forms').get() as { c: number };
  const sensesCount = db.prepare('SELECT COUNT(*) as c FROM senses').get() as { c: number };

  console.log(`Lemmas:       ${lemmasCount.c}`);
  console.log(`Forms:        ${formsCount.c}`);
  console.log(`Senses:       ${sensesCount.c}`);

  // Referential Integrity Checks
  const orphanedForms = db.prepare('SELECT COUNT(*) as c FROM forms WHERE lemma_id NOT IN (SELECT id FROM lemmas)').get() as { c: number };
  const orphanedSenses = db.prepare('SELECT COUNT(*) as c FROM senses WHERE lemma_id NOT IN (SELECT id FROM lemmas)').get() as { c: number };
  const emptyTranslations = db.prepare("SELECT COUNT(*) as c FROM senses WHERE translation = '' OR translation IS NULL").get() as { c: number };
  const orphanLemmas = db.prepare("SELECT COUNT(*) as c FROM lemmas WHERE id NOT IN (SELECT lemma_id FROM senses)").get() as { c: number };

  let pass = true;

  if (orphanedForms.c > 0) {
    console.error(`❌ Validation Failed: Found ${orphanedForms.c} orphaned forms.`);
    pass = false;
  }
  if (orphanedSenses.c > 0) {
    console.error(`❌ Validation Failed: Found ${orphanedSenses.c} orphaned senses.`);
    pass = false;
  }
  if (emptyTranslations.c > 0) {
    console.error(`❌ Validation Failed: Found ${emptyTranslations.c} empty translations.`);
    pass = false;
  }
  if (orphanLemmas.c > 0) {
    console.error(`❌ Validation Failed: Found ${orphanLemmas.c} lemmas without senses.`);
    pass = false;
  }

  if (lemmasCount.c === 0) {
    console.error(`❌ Validation Failed: No lemmas found.`);
    pass = false;
  }
  
  const stats = fs.statSync(config.paths.db);
  const sizeMB = stats.size / (1024 * 1024);
  console.log(`Database Size: ${sizeMB.toFixed(2)} MB`);
  
  if (sizeMB > 400) {
    console.error(`❌ Validation Failed: Database size (${sizeMB.toFixed(2)} MB) exceeds 400 MB budget.`);
    pass = false;
  }

  console.log(`\nValidation: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  process.exit(pass ? 0 : 1);
}

validateDatabase();
