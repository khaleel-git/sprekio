import fs from 'fs';
import readline from 'readline';
import Database from 'better-sqlite3';
import { config } from '../config.ts';

async function buildDatabase() {
  const isDryRun = process.argv.includes('--dry-run');

  if (!fs.existsSync(config.paths.source)) {
    console.error(`Source file not found at ${config.paths.source}. Run download first.`);
    process.exit(1);
  }

  let db: any = null;
  let insertLemma: any = null;
  let insertForm: any = null;
  let insertSense: any = null;

  if (!isDryRun) {
    if (fs.existsSync(config.paths.db)) {
      fs.unlinkSync(config.paths.db);
    }
    db = new Database(config.paths.db);

    db.exec(`
      CREATE TABLE lemmas (
        id TEXT PRIMARY KEY,
        lemma TEXT NOT NULL,
        language TEXT NOT NULL,
        part_of_speech TEXT,
        gender TEXT,
        frequency REAL DEFAULT 0,
        source TEXT,
        source_id TEXT
      );
      
      CREATE TABLE forms (
        id TEXT PRIMARY KEY,
        lemma_id TEXT NOT NULL,
        surface TEXT NOT NULL,
        normalized TEXT NOT NULL,
        grammatical_info TEXT,
        FOREIGN KEY(lemma_id) REFERENCES lemmas(id)
      );
      
      CREATE TABLE senses (
        id TEXT PRIMARY KEY,
        lemma_id TEXT NOT NULL,
        translation TEXT NOT NULL,
        definition TEXT,
        frequency REAL DEFAULT 0,
        FOREIGN KEY(lemma_id) REFERENCES lemmas(id)
      );
      
      CREATE TABLE dictionary_metadata (
        version TEXT,
        source TEXT,
        source_date TEXT,
        generated_at INTEGER,
        transform_version TEXT
      );
      
      CREATE INDEX idx_forms_normalized ON forms(normalized);
      CREATE INDEX idx_senses_lemma_id ON senses(lemma_id);
    `);

    db.prepare(`INSERT INTO dictionary_metadata (version, source, source_date, generated_at, transform_version) VALUES (?, ?, ?, ?, ?)`).run(
      `sprekio-de-${config.sourceDate}`,
      'kaikki',
      config.sourceDate,
      Date.now(),
      config.transformVersion
    );

    insertLemma = db.prepare(`INSERT INTO lemmas (id, lemma, language, part_of_speech, gender, source, source_id) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    insertForm = db.prepare(`INSERT INTO forms (id, lemma_id, surface, normalized, grammatical_info) VALUES (?, ?, ?, ?, ?)`);
    insertSense = db.prepare(`INSERT INTO senses (id, lemma_id, translation, definition) VALUES (?, ?, ?, ?)`);

    db.exec('BEGIN TRANSACTION');
  }

  const fileStream = fs.createReadStream(config.paths.source);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let rawEntriesCount = 0;
  let germanEntriesCount = 0;
  let lemmaCount = 0;
  let formCount = 0;
  let senseCount = 0;
  
  // Exclusion stats
  const stats = {
    malformed: 0,
    nonGerman: 0,
    unsupportedPOS: 0,
    obsoleteOrSkippedTags: 0,
    missingTranslation: 0,
    noValidForms: 0
  };

  console.log(`Processing Kaikki German... ${isDryRun ? '(DRY RUN)' : ''}\n`);
  const startTime = Date.now();

  for await (const line of rl) {
    rawEntriesCount++;
    try {
      const entry = JSON.parse(line);
      
      if (entry.lang === 'German') germanEntriesCount++;
      
      if (!entry.word) {
        stats.malformed++;
        continue;
      }
      if (entry.lang !== 'German') {
        stats.nonGerman++;
        continue;
      }
      if (entry.pos && !config.inclusion.validPOS.includes(entry.pos.toLowerCase())) {
        stats.unsupportedPOS++;
        continue;
      }

      let hasExcludedTag = false;
      if (entry.senses) {
        for (const sense of entry.senses) {
          if (sense.tags && sense.tags.some((t: string) => config.inclusion.skipTags.includes(t.toLowerCase()))) {
            hasExcludedTag = true;
            break;
          }
        }
      }
      if (hasExcludedTag) {
        stats.obsoleteOrSkippedTags++;
        continue;
      }

      const validTranslations: string[] = [];
      if (entry.senses) {
        for (const sense of entry.senses) {
          const t = sense.glosses ? sense.glosses[0] : '';
          if (t && t.trim() !== '') validTranslations.push(t);
        }
      }
      
      if (validTranslations.length === 0) {
        stats.missingTranslation++;
        continue;
      }

      // 1. Insert Lemma
      const lemmaId = `l_${lemmaCount}`;
      const lemmaWord = entry.word;
      
      let gender = null;
      if (entry.senses && entry.senses[0]?.tags) {
        if (entry.senses[0].tags.includes('masculine')) gender = 'der';
        if (entry.senses[0].tags.includes('feminine')) gender = 'die';
        if (entry.senses[0].tags.includes('neuter')) gender = 'das';
      }

      if (!isDryRun) insertLemma.run(lemmaId, lemmaWord, 'de', entry.pos || 'unknown', gender, 'kaikki', entry.id || null);
      lemmaCount++;

      // 2. Insert Forms
      if (!isDryRun) insertForm.run(`f_${formCount}`, lemmaId, lemmaWord, lemmaWord.toLowerCase(), 'lemma');
      formCount++;
      
      if (entry.forms) {
        const seenForms = new Set<string>();
        seenForms.add(lemmaWord.toLowerCase());
        
        for (const form of entry.forms) {
          if (form.form && form.form !== '-') {
            const normalized = form.form.toLowerCase();
            if (!seenForms.has(normalized)) {
              seenForms.add(normalized);
              const info = form.tags ? form.tags.join(', ') : '';
              if (!isDryRun) insertForm.run(`f_${formCount}`, lemmaId, form.form, normalized, info);
              formCount++;
            }
          }
        }
      }

      // 3. Insert Senses
      for (const t of validTranslations) {
        if (!isDryRun) insertSense.run(`s_${senseCount}`, lemmaId, t, t);
        senseCount++;
      }
      
      if (rawEntriesCount % 50000 === 0) {
        const elapsedSecs = (Date.now() - startTime) / 1000;
        const rate = rawEntriesCount / elapsedSecs;
        console.log(`Entries processed: ${rawEntriesCount.toLocaleString()} | Accepted: ${lemmaCount.toLocaleString()} | Rate: ${Math.round(rate).toLocaleString()} entries/sec`);
        
        if (!isDryRun) {
          db.exec('COMMIT');
          db.exec('BEGIN TRANSACTION');
        }
      }

    } catch (err) {
      stats.malformed++;
    }
  }

  if (!isDryRun) {
    db.exec('COMMIT');
    db.close();
  }

  const elapsedSecs = (Date.now() - startTime) / 1000;
  const minutes = Math.floor(elapsedSecs / 60);
  const seconds = Math.floor(elapsedSecs % 60);

  console.log(`\nSprekio Dictionary Build Statistics`);
  console.log(`-----------------------------------`);
  console.log(`Raw entries:              ${rawEntriesCount.toLocaleString()}`);
  console.log(`German entries:           ${germanEntriesCount.toLocaleString()}`);
  console.log(`Accepted lemmas:          ${lemmaCount.toLocaleString()}`);
  console.log(`Accepted forms:           ${formCount.toLocaleString()}`);
  console.log(`Accepted senses:          ${senseCount.toLocaleString()}`);
  console.log(`\nExcluded:`);
  console.log(`  obsolete/skipped:       ${stats.obsoleteOrSkippedTags.toLocaleString()}`);
  console.log(`  unsupported POS:        ${stats.unsupportedPOS.toLocaleString()}`);
  console.log(`  missing translation:    ${stats.missingTranslation.toLocaleString()}`);
  console.log(`  non-German:             ${stats.nonGerman.toLocaleString()}`);
  console.log(`  malformed:              ${stats.malformed.toLocaleString()}`);
  console.log(`\nTime Elapsed:             ${minutes}m ${seconds}s`);
  console.log(`Average Rate:             ${Math.round(rawEntriesCount / elapsedSecs).toLocaleString()} entries/sec`);
}

buildDatabase().catch(console.error);
