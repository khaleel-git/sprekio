import fs from 'fs';
import https from 'https';
import { config } from '../config';

async function downloadKaikki() {
  console.log(`Downloading Kaikki data from ${config.kaikkiUrl}...`);
  console.log(`Target: ${config.paths.source}`);

  if (fs.existsSync(config.paths.source)) {
    console.log('File already exists. Skipping download.');
    return;
  }

  const file = fs.createWriteStream(config.paths.source);

  return new Promise((resolve, reject) => {
    https.get(config.kaikkiUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${config.kaikkiUrl}' (${response.statusCode})`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log('Download completed successfully.');
        resolve(true);
      });
    }).on('error', (err) => {
      fs.unlink(config.paths.source, () => {}); // Delete the file async.
      reject(err);
    });
  });
}

downloadKaikki().catch(console.error);
