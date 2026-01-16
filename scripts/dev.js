#!/usr/bin/env node
/**
 * Development Mode Script
 * 
 * Reverts index.html to use script.js directly (no bundling).
 * Use this when developing to avoid needing a build step.
 * 
 * Usage:
 *   npm run dev:reset
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

function resetToDev() {
  const indexPath = join(rootDir, 'index.html');
  let html = readFileSync(indexPath, 'utf-8');
  
  // Replace bundled script with dev script
  html = html.replace(
    /<script src="dist\/bundle\.[a-f0-9]+\.js" type="module"><\/script>/,
    '<script src="script.js" type="module"></script>'
  );
  
  writeFileSync(indexPath, html);
  console.log('✅ Reset to development mode (using script.js directly)');
}

resetToDev();
