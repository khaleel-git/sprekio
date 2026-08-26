import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { config } from '../config.ts';

const exportPath = path.join(__dirname, '../data/export.sql');

console.log('Generating UTF-8 safe SQL dump from staging database...');

const outStream = fs.createWriteStream(exportPath, { encoding: 'utf8' });
const sqliteProc = spawn('sqlite3', [config.paths.db, '.dump']);

sqliteProc.stdout.pipe(outStream);

sqliteProc.stderr.on('data', (data) => {
  console.error(`sqlite3 stderr: ${data}`);
});

sqliteProc.on('close', (code) => {
  if (code !== 0) {
    console.error(`sqlite3 process exited with code ${code}`);
    process.exit(code || 1);
  }
  console.log(`Successfully created UTF-8 export at ${exportPath}`);
});
