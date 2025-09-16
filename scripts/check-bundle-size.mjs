#!/usr/bin/env node
/**
 * Simple bundle size budget checker.
 * Scans ./js build output for key bundles and enforces raw + gzip thresholds.
 */
import { createGzip } from 'zlib';
import { promisify } from 'util';
import { pipeline } from 'stream';
import fs from 'fs';
import path from 'path';

const pipe = promisify(pipeline);

const TARGETS = [
  { pattern: /^threedviewer-main\.mjs$/, maxRaw: 950_000, maxGzip: 260_000 },
  { pattern: /^gltf-.*\.chunk\.mjs$/, maxRaw: 120_000, maxGzip: 40_000 },
  { pattern: /^FBXLoader-.*\.chunk\.mjs$/, maxRaw: 120_000, maxGzip: 50_000 },
];

const buildDir = path.resolve(process.cwd(), 'js');
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

async function run() {
  const files = fs.readdirSync(buildDir).filter(f => f.endsWith('.mjs'));
  let failed = false;
  for (const target of TARGETS) {
    const matched = files.filter(f => target.pattern.test(f));
    if (matched.length === 0) continue;
    for (const file of matched) {
      const full = path.join(buildDir, file);
      const raw = fs.statSync(full).size;
      const gzip = await gzipSizeSync(fs.readFileSync(full));
      if (raw > target.maxRaw || gzip > target.maxGzip) {
        failed = true;
        console.error(`[size-check] FAIL ${file} raw=${raw} gzip=${gzip} > limits raw<=${target.maxRaw} gzip<=${target.maxGzip}`);
      } else {
        console.log(`[size-check] OK   ${file} raw=${raw} gzip=${gzip}`);
      }
    }
  }
  if (failed) {
    console.error('[size-check] One or more bundles exceed budget. Adjust code or update thresholds consciously.');
    const skip = process.env.SKIP_SIZE_CHECK === '1'
    const soft = process.env.SIZE_CHECK_SOFT === '1'
    const ci = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'
    if (skip) {
      console.warn('[size-check] SKIP_SIZE_CHECK=1 set, not failing build.')
      return
    }
    if (soft && !ci) {
      console.warn('[size-check] SIZE_CHECK_SOFT=1 (non-CI), not failing build.')
      return
    }
    process.exit(2);
  } else {
    console.log('[size-check] All checked bundles within budget.');
  }
}

run().catch(err => { console.error('[size-check] error', err); process.exit(1); });
