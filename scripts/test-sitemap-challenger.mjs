import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sitemapPath = join(root, 'web', 'sitemap.xml');
const generateScriptPath = join(root, 'scripts', 'generate-sitemap.mjs');

console.log('=== RUNNING EMPIRICAL CHALLENGER TESTS FOR M2 ===\n');

let totalTests = 0;
let passedTests = 0;

function assertTest(name, condition, details = '') {
  totalTests++;
  if (condition) {
    console.log(`[PASS] Test ${totalTests}: ${name}`);
    passedTests++;
  } else {
    console.error(`[FAIL] Test ${totalTests}: ${name} ${details ? '(' + details + ')' : ''}`);
  }
}

// Helper XML Parser & Validator
function validateSitemapXml(xmlContent) {
  const errors = [];

  // Check declaration
  if (!xmlContent.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
    errors.push('Missing or invalid XML declaration header');
  }

  // Check urlset tag and namespace
  if (!xmlContent.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')) {
    errors.push('Missing or invalid <urlset> tag or namespace');
  }

  if (!xmlContent.trim().endsWith('</urlset>')) {
    errors.push('XML does not close with </urlset>');
  }

  // Extract <url> blocks
  const urlBlockRegex = /<url>([\s\S]*?)<\/url>/g;
  const urlBlocks = [...xmlContent.matchAll(urlBlockRegex)];

  if (urlBlocks.length === 0) {
    errors.push('No <url> elements found in sitemap');
  }

  const urls = [];
  for (const block of urlBlocks) {
    const inner = block[1];
    const locMatch = inner.match(/<loc>(.*?)<\/loc>/);
    const lastmodMatch = inner.match(/<lastmod>(.*?)<\/lastmod>/);
    const changefreqMatch = inner.match(/<changefreq>(.*?)<\/changefreq>/);
    const priorityMatch = inner.match(/<priority>(.*?)<\/priority>/);

    if (!locMatch) errors.push('Missing <loc> element in url block');
    if (!lastmodMatch) errors.push('Missing <lastmod> element in url block');
    if (!changefreqMatch) errors.push('Missing <changefreq> element in url block');
    if (!priorityMatch) errors.push('Missing <priority> element in url block');

    if (locMatch) {
      const loc = locMatch[1];
      if (!loc.startsWith('https://www.mechaa.es/')) {
        errors.push(`URL does not start with https://www.mechaa.es/: ${loc}`);
      }
      urls.push(loc);
    }

    if (lastmodMatch) {
      const lastmod = lastmodMatch[1];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod)) {
        errors.push(`Invalid lastmod date format (expected YYYY-MM-DD): ${lastmod}`);
      }
    }

    if (changefreqMatch) {
      const freq = changefreqMatch[1];
      const validFreqs = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
      if (!validFreqs.includes(freq)) {
        errors.push(`Invalid changefreq value: ${freq}`);
      }
    }

    if (priorityMatch) {
      const priority = parseFloat(priorityMatch[1]);
      if (isNaN(priority) || priority < 0.0 || priority > 1.0) {
        errors.push(`Invalid priority value (must be 0.0-1.0): ${priorityMatch[1]}`);
      }
    }
  }

  return { valid: errors.length === 0, errors, urls };
}

// 1. Test Normal Execution
try {
  const output = execSync(`node "${generateScriptPath}"`, { encoding: 'utf8', cwd: root });
  assertTest('Normal script execution returns exit code 0', true);
  assertTest('Output file web/sitemap.xml exists', existsSync(sitemapPath));
  
  const content = readFileSync(sitemapPath, 'utf8');
  const xmlResult = validateSitemapXml(content);
  assertTest('Generated web/sitemap.xml is valid XML', xmlResult.valid, xmlResult.errors.join(', '));
  assertTest('Sitemap contains static homepage URL', xmlResult.urls.includes('https://www.mechaa.es/'));
  assertTest('Sitemap contains /salones URL', xmlResult.urls.includes('https://www.mechaa.es/salones'));
  assertTest('Sitemap contains /especificaciones.html URL', xmlResult.urls.includes('https://www.mechaa.es/especificaciones.html'));
  assertTest('Sitemap contains /calculadora-comisiones URL', xmlResult.urls.includes('https://www.mechaa.es/calculadora-comisiones'));
  assertTest('Sitemap contains active salon URL', xmlResult.urls.some(u => u.startsWith('https://www.mechaa.es/salon/')));
} catch (err) {
  assertTest('Normal script execution', false, err.message);
}

// 2. Test Stress Scenario: Unreachable / Bad Network Endpoint
try {
  // Pass non-existent host via env var
  const envOverride = {
    ...process.env,
    EXPO_PUBLIC_SUPABASE_URL: 'https://unreachable-endpoint-test-123456789.supabase.co'
  };
  
  // Note: generate-sitemap.mjs reads .env if present and overwrites process.env.
  // We test if script handles fetch error gracefully by temporarily backing up .env
  const envPath = join(root, '.env');
  const envBackupPath = join(root, '.env.challenger_bak');
  let envBackedUp = false;
  if (existsSync(envPath)) {
    const envData = readFileSync(envPath, 'utf8');
    writeFileSync(envBackupPath, envData, 'utf8');
    // Write invalid URL into temporary test .env
    writeFileSync(envPath, 'EXPO_PUBLIC_SUPABASE_URL=https://unreachable-endpoint-test-123456789.supabase.co\nEXPO_PUBLIC_SUPABASE_ANON_KEY=invalid_key\n', 'utf8');
    envBackedUp = true;
  }

  try {
    const output = execSync(`node "${generateScriptPath}"`, { encoding: 'utf8', cwd: root, env: envOverride });
    assertTest('Bad network / unreachable endpoint handles error without failing build (exit code 0)', true);
    
    const content = readFileSync(sitemapPath, 'utf8');
    const xmlResult = validateSitemapXml(content);
    assertTest('Fallback sitemap generated during unreachable endpoint is valid XML', xmlResult.valid, xmlResult.errors.join(', '));
    assertTest('Fallback sitemap contains default fallback salon slug', xmlResult.urls.includes('https://www.mechaa.es/salon/florent-suarez-peluqueros'));
  } finally {
    if (envBackedUp && existsSync(envBackupPath)) {
      const originalEnv = readFileSync(envBackupPath, 'utf8');
      writeFileSync(envPath, originalEnv, 'utf8');
      try { execSync(`rimraf "${envBackupPath}"` || `unlink "${envBackupPath}"`); } catch (_) {
        // cleanup using fs if rimraf not present
      }
    }
  }
} catch (err) {
  assertTest('Bad network / unreachable endpoint stress test', false, err.message);
}

// 3. Test Stress Scenario: Missing Environment Variables & No .env
try {
  const envPath = join(root, '.env');
  const envBackupPath = join(root, '.env.challenger_bak2');
  let envBackedUp = false;
  if (existsSync(envPath)) {
    const envData = readFileSync(envPath, 'utf8');
    writeFileSync(envBackupPath, envData, 'utf8');
    // Temporarily point .env with invalid values to test missing/default fallback
    writeFileSync(envPath, '# Empty env\n', 'utf8');
    envBackedUp = true;
  }

  try {
    const output = execSync(`node "${generateScriptPath}"`, { encoding: 'utf8', cwd: root });
    assertTest('Missing .env variables uses default fallback URL & key cleanly', true);
    
    const content = readFileSync(sitemapPath, 'utf8');
    const xmlResult = validateSitemapXml(content);
    assertTest('Sitemap generated with default fallback credentials is valid XML', xmlResult.valid, xmlResult.errors.join(', '));
  } finally {
    if (envBackedUp && existsSync(envBackupPath)) {
      const originalEnv = readFileSync(envBackupPath, 'utf8');
      writeFileSync(envPath, originalEnv, 'utf8');
    }
  }
} catch (err) {
  assertTest('Missing environment variables stress test', false, err.message);
}

// 4. Test Robots.txt Compliance
try {
  const robotsPath = join(root, 'web', 'robots.txt');
  assertTest('web/robots.txt exists', existsSync(robotsPath));
  const robotsContent = readFileSync(robotsPath, 'utf8');
  assertTest('web/robots.txt contains Sitemap directive', robotsContent.includes('Sitemap: https://www.mechaa.es/sitemap.xml'));
  assertTest('web/robots.txt disallows /admin.html', robotsContent.includes('Disallow: /admin.html'));
  assertTest('web/robots.txt disallows /restablecer.html', robotsContent.includes('Disallow: /restablecer.html'));
  assertTest('web/robots.txt disallows /app/', robotsContent.includes('Disallow: /app/'));
} catch (err) {
  assertTest('Robots.txt verification', false, err.message);
}

// 5. Test package.json Scripts Wiring
try {
  const pkgPath = join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  assertTest('package.json has "generate:sitemap" script', pkg.scripts && pkg.scripts['generate:sitemap'] === 'node scripts/generate-sitemap.mjs');
  assertTest('package.json has "postbuild" script', pkg.scripts && pkg.scripts['postbuild'] === 'node scripts/generate-sitemap.mjs');
  assertTest('package.json "build:web" includes sitemap generation', pkg.scripts && pkg.scripts['build:web'] && pkg.scripts['build:web'].includes('generate-sitemap.mjs'));
} catch (err) {
  assertTest('package.json scripts verification', false, err.message);
}

console.log(`\n=== TEST SUMMARY: ${passedTests}/${totalTests} PASSED ===`);
if (passedTests !== totalTests) {
  process.exit(1);
}
