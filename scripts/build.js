#!/usr/bin/env node
/**
 * Build Script
 * 
 * Bundles client-side JavaScript with automatic cache busting.
 * Uses esbuild for fast, zero-config bundling.
 * 
 * Usage:
 *   npm run build        # Production build with minification
 *   npm run build:dev    # Development build without minification
 */

import { build } from 'esbuild';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const distDir = join(rootDir, 'dist');

const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');

/**
 * Clean old bundle files from dist directory
 * Removes all bundle.*.js files to prevent stale cache accumulation
 */
function cleanOldBundles() {
  if (!existsSync(distDir)) return;
  
  const files = readdirSync(distDir);
  let cleaned = 0;
  
  for (const file of files) {
    // Remove old hashed bundles and temporary bundle.js
    if (file.match(/^bundle(\.[a-f0-9]+)?\.js(\.map)?$/)) {
      unlinkSync(join(distDir, file));
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`   Cleaned ${cleaned} old bundle file(s)`);
  }
}

async function buildClient() {
  console.log(`\n🔨 Building client (${isProd ? 'production' : 'development'})...\n`);
  
  // Ensure dist directory exists
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }
  
  // Clean old bundles before building to prevent cache accumulation
  cleanOldBundles();
  
  try {
    // Bundle the main script - write directly to memory via write: false
    const result = await build({
      entryPoints: [join(rootDir, 'script.js')],
      bundle: true,
      outfile: join(distDir, 'bundle.js'), // Required for sourcemap generation
      write: false, // Don't write to disk, we'll handle it ourselves
      format: 'esm',
      platform: 'browser',
      target: ['es2020'],
      minify: isProd,
      sourcemap: isProd ? false : 'external', // External sourcemap for dev builds
      metafile: true,
      logLevel: 'info',
    });
    
    // Get bundle content from build result
    const bundleFile = result.outputFiles.find(f => f.path.endsWith('.js'));
    const sourcemapFile = result.outputFiles.find(f => f.path.endsWith('.js.map'));
    let bundleContent = bundleFile.text;
    
    // Create hash for cache busting
    const hash = createHash('md5').update(bundleContent).digest('hex').slice(0, 8);
    const hashedFilename = `bundle.${hash}.js`;
    
    // Add sourcemap reference to bundle (esbuild doesn't add it when write: false)
    if (sourcemapFile) {
      bundleContent += `\n//# sourceMappingURL=${hashedFilename}.map`;
    }
    
    // Write the hashed bundle
    writeFileSync(join(distDir, hashedFilename), bundleContent);
    
    // Write sourcemap if in dev mode
    if (sourcemapFile) {
      let sourcemapContent = sourcemapFile.text;
      // Update the "file" field in sourcemap to point to hashed filename
      sourcemapContent = sourcemapContent.replace(
        /"file":\s*"bundle\.js"/,
        `"file":"${hashedFilename}"`
      );
      writeFileSync(join(distDir, `${hashedFilename}.map`), sourcemapContent);
    }
    
    // Write manifest for server to read
    const manifest = {
      'script.js': hashedFilename,
      buildTime: new Date().toISOString(),
      mode: isProd ? 'production' : 'development',
    };
    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    
    // Update index.html with the hashed script
    updateIndexHtml(hashedFilename);
    
    console.log(`\n✅ Build complete!`);
    console.log(`   Output: dist/${hashedFilename}`);
    console.log(`   Size: ${(bundleContent.length / 1024).toFixed(2)} KB`);
    if (isProd) {
      console.log(`   Minified: Yes`);
    }
    console.log('');
    
    return { success: true, filename: hashedFilename };
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

function updateIndexHtml(hashedFilename) {
  const indexPath = join(rootDir, 'index.html');
  let html = readFileSync(indexPath, 'utf-8');
  
  // Replace the script tag - handles dev (script.js) and previous built versions
  html = html.replace(
    /<script src="(script\.js(\?v=\d+)?|dist\/bundle\.[a-f0-9]+\.js)" type="module"><\/script>/,
    `<script src="dist/${hashedFilename}" type="module"></script>`
  );
  
  // Cache bust CSS with timestamp
  const cssVersion = Date.now();
  html = html.replace(
    /<link rel="stylesheet" href="style\.css(\?v=\d+)?">/,
    `<link rel="stylesheet" href="style.css?v=${cssVersion}">`
  );
  
  writeFileSync(indexPath, html);
  console.log(`   Updated: index.html`);
}

// Run build
buildClient();
