import fs from 'fs';
import path from 'path';

const files = [
  'web/index.html',
  'web/especificaciones.html',
  'web/calculadora-comisiones.html',
  'web/salones.html',
  'web/salon.html'
];

let totalBlocks = 0;
let errors = 0;

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const regex = /<script\s+type=["']application\/ld\+json["'](?:\s+id=["'][^"']+["'])?\s*>([\s\S]*?)<\/script>/gi;
  let match;
  let count = 0;
  while ((match = regex.exec(content)) !== null) {
    count++;
    totalBlocks++;
    try {
      const parsed = JSON.parse(match[1]);
      console.log(`[PASS] ${file} Block #${count} - @type: ${JSON.stringify(parsed['@type'])}`);
    } catch (err) {
      errors++;
      console.error(`[FAIL] ${file} Block #${count} - JSON Error: ${err.message}`);
    }
  }
  if (count === 0) {
    console.warn(`[WARN] ${file} - No JSON-LD blocks found!`);
  }
});

console.log(`\nSummary: Verified ${totalBlocks} JSON-LD blocks across ${files.length} files. Errors: ${errors}.`);
if (errors > 0) process.exit(1);
