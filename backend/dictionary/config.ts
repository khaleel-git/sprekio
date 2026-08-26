import path from 'path';

export const config = {
  kaikkiUrl: 'https://kaikki.org/dictionary/German/kaikki.org-dictionary-German.jsonl',
  sourceDate: '2026-08-04',
  transformVersion: '1',
  
  paths: {
    source: path.join(__dirname, 'source/kaikki-german.jsonl'),
    db: path.join(__dirname, 'data/staging.db'),
    outputDir: path.join(__dirname, 'output/')
  },
  
  // Inclusion policy
  inclusion: {
    validLanguages: ['German'],
    validPOS: ['noun', 'verb', 'adj', 'adv', 'prep', 'pron', 'conj', 'det', 'num', 'phrase', 'part', 'intj'],
    skipTags: ['obsolete', 'archaic', 'abbreviation', 'slang', 'vulgar'],
    requireEnglishTranslation: true
  }
};
