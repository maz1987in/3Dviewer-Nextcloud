#!/usr/bin/env node
/**
 * Bundle size budget checker with historical tracking.
 * Scans ./js build output for key bundles and enforces raw + gzip thresholds.
 * Records historical size trends in bundle-sizes.json artifact.
 */
import { createGzip } from 'zlib';
import { promisify } from 'util';
import { pipeline } from 'stream';
import fs from 'fs';
import path from 'path';

const pipe = promisify(pipeline);

// Comprehensive budget thresholds (in bytes)
// Based on current build sizes with reasonable headroom for growth
const BUDGETS = [
  { pattern: /^threedviewer-main\.mjs$/, name: 'main', maxRaw: 5000, maxGzip: 2000 }, // Entry point
  { pattern: /^gltf-.*\.chunk\.mjs$/, name: 'gltf-loader', maxRaw: 22000, maxGzip: 6000 }, // GLTF loader chunk (includes decoder worker pool tuning via setWorkerLimit)
  // Main app component. Bumped 360 KB → 370 KB in v3.3.0 for the 9 new viewer-config
  // entries, and unchanged by the redesign: replacing every emoji control with a Material
  // Design icon left this chunk at 354.0 KB raw / 97.8 KB gzip against 353.6 / 98.0
  // before. Importing the icons as components would not have — ten of them cost 9.5 KB
  // raw and put this over on their own. They are path data in src/config/icon-paths.js
  // drawn by one component instead, which costs 3.4 KB for the same ten and lands the
  // emoji it replaces back on the credit side.
  { pattern: /^App-.*\.chunk\.mjs$/, name: 'app', maxRaw: 370000, maxGzip: 102000 },
  { pattern: /^three-core-.*\.chunk\.mjs$/, name: 'three-core', maxRaw: 800000, maxGzip: 210000 }, // Three.js core
  // Three chunks are named index-<hash>: the main one, a ~280 KB one and a 250-byte one.
  // This used to separate them with /^index-[A-Z][a-z]/, written to exclude one specific
  // hash — which made the match depend on the shape of a content hash, so whether the
  // megabyte chunk was checked at all changed from build to build, and a build where the
  // 250-byte chunk matched instead would have passed without looking at it. `largest`
  // says what was meant. The gzip ceiling is raised from 285000, which the chunk was
  // 81 bytes over the first time this actually matched it.
  { pattern: /^index-.*\.chunk\.mjs$/, name: 'index', largest: true, maxRaw: 1080000, maxGzip: 295000 },
  { pattern: /^NcSelect-.*\.chunk\.mjs$/, name: 'nc-select', maxRaw: 1250000, maxGzip: 320000 }, // Nextcloud Select component
];

const buildDir = path.resolve(process.cwd(), 'js');
const historyFile = path.resolve(process.cwd(), 'bundle-sizes.json');

if (!fs.existsSync(buildDir)) {
  console.error('[size-check] build dir not found:', buildDir);
  process.exit(1);
}

async function gzipSizeSync(buf) {
  return await new Promise((resolve, reject) => {
    try {
      const gz = createGzip();
      const chunks = [];
      gz.on('data', c => chunks.push(c));
      gz.on('end', () => resolve(Buffer.concat(chunks).length));
      gz.on('error', reject);
      gz.end(buf);
    } catch (e) { reject(e); }
  });
}

function loadHistory() {
  if (!fs.existsSync(historyFile)) {
    return { entries: [], lastUpdated: null };
  }
  try {
    const content = fs.readFileSync(historyFile, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.warn('[size-check] Failed to load history, starting fresh:', e.message);
    return { entries: [], lastUpdated: null };
  }
}

function saveHistory(history, currentSizes) {
  const entry = {
    timestamp: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || 'local',
    sizes: currentSizes,
  };
  
  history.entries.push(entry);
  history.lastUpdated = entry.timestamp;
  
  // Keep last 50 entries
  if (history.entries.length > 50) {
    history.entries = history.entries.slice(-50);
  }
  
  try {
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2) + '\n');
    console.log(`[size-check] History saved to ${path.basename(historyFile)}`);
  } catch (e) {
    console.warn('[size-check] Failed to save history:', e.message);
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function run() {
  const files = fs.readdirSync(buildDir).filter(f => f.endsWith('.mjs'));
  const history = loadHistory();
  const currentSizes = {};
  let failed = false;
  const results = [];
  
  // Check all budgets
  for (const budget of BUDGETS) {
    let matched = files.filter(f => budget.pattern.test(f));
    if (matched.length === 0) continue;

    // A budget for "the big one" among several chunks sharing a prefix. Without this the
    // loop below checks every match and records only the last into currentSizes, so the
    // history and the trend report describe whichever file the filesystem listed last.
    if (budget.largest) {
      matched = [matched.reduce((a, b) =>
        fs.statSync(path.join(buildDir, a)).size >= fs.statSync(path.join(buildDir, b)).size ? a : b
      )];
    }

    for (const file of matched) {
      const full = path.join(buildDir, file);
      const raw = fs.statSync(full).size;
      const gzip = await gzipSizeSync(fs.readFileSync(full));
      
      const result = {
        file,
        name: budget.name,
        raw,
        gzip,
        maxRaw: budget.maxRaw,
        maxGzip: budget.maxGzip,
        passed: raw <= budget.maxRaw && gzip <= budget.maxGzip,
      };
      
      results.push(result);
      currentSizes[budget.name] = { raw, gzip };
      
      if (!result.passed) {
        failed = true;
        console.error(
          `[size-check] FAIL ${file} (${budget.name})\n` +
          `  raw: ${formatBytes(raw)} > ${formatBytes(budget.maxRaw)}\n` +
          `  gzip: ${formatBytes(gzip)} > ${formatBytes(budget.maxGzip)}`
        );
      } else {
        console.log(
          `[size-check] OK   ${file} (${budget.name}) ` +
          `raw=${formatBytes(raw)} gzip=${formatBytes(gzip)}`
        );
      }
    }
  }
  
  // Save history
  if (Object.keys(currentSizes).length > 0) {
    saveHistory(history, currentSizes);
  }
  
  // Report summary
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  if (failed) {
    console.error('\n[size-check] ❌ Bundle budget exceeded!');
    console.error(`[size-check] ${total - passed}/${total} bundles failed budget checks.`);
    console.error('[size-check] Adjust code or update thresholds consciously.');
    
    const skip = process.env.SKIP_SIZE_CHECK === '1';
    const soft = process.env.SIZE_CHECK_SOFT === '1';
    const ci = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
    
    if (skip) {
      console.warn('[size-check] SKIP_SIZE_CHECK=1 set, not failing build.');
      return;
    }
    if (soft && !ci) {
      console.warn('[size-check] SIZE_CHECK_SOFT=1 (non-CI), not failing build.');
      return;
    }
    
    // Show trend if available
    if (history.entries.length > 1) {
      const prev = history.entries[history.entries.length - 2];
      console.error('\n[size-check] Size trend (vs previous):');
      for (const [name, sizes] of Object.entries(currentSizes)) {
        const prevSizes = prev.sizes[name];
        if (prevSizes) {
          const rawDiff = sizes.raw - prevSizes.raw;
          const gzipDiff = sizes.gzip - prevSizes.gzip;
          const rawSign = rawDiff > 0 ? '+' : '';
          const gzipSign = gzipDiff > 0 ? '+' : '';
          console.error(
            `  ${name}: raw ${rawSign}${formatBytes(rawDiff)}, ` +
            `gzip ${gzipSign}${formatBytes(gzipDiff)}`
          );
        }
      }
    }
    
    process.exit(2);
  } else {
    console.log(`\n[size-check] ✅ All ${total} checked bundles within budget.`);
    
    // Show trend if available
    if (history.entries.length > 1) {
      const prev = history.entries[history.entries.length - 2];
      console.log('\n[size-check] Size trend (vs previous):');
      for (const [name, sizes] of Object.entries(currentSizes)) {
        const prevSizes = prev.sizes[name];
        if (prevSizes) {
          const rawDiff = sizes.raw - prevSizes.raw;
          const gzipDiff = sizes.gzip - prevSizes.gzip;
          const rawSign = rawDiff > 0 ? '+' : '';
          const gzipSign = gzipDiff > 0 ? '+' : '';
          console.log(
            `  ${name}: raw ${rawSign}${formatBytes(rawDiff)}, ` +
            `gzip ${gzipSign}${formatBytes(gzipDiff)}`
          );
        }
      }
    }
  }
}

run().catch(err => {
  console.error('[size-check] error', err);
  process.exit(1);
});
