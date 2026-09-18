import { readFile, writeFile, mkdir, copyFile, rm, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import CleanCSSModule from 'clean-css';
import { minify as minifyHTML } from 'html-minifier-terser';
import { minify as minifyJS } from 'terser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const CleanCSS = CleanCSSModule.default || CleanCSSModule;

// Production files specification
const HTML_FILES = ['index.html', 'nihongo-studio.html', 'login.html'];
const CSS_FILES = ['studio.css', 'auth.css'];
const JS_FILES = [
  'studio-session.js',
  'studio-guest.js',
  'studio-api.js',
  'studio-ui.js',
  'studio-daily.js',
  'studio-quiz.js',
  'studio-library.js',
  'studio-core.js',
  'language-configs.js'
];
const ASSET_DIRS = ['assets'];
const JSON_FILES = [
  'nihongo_lists.json',
  'global_scores.json',
  'global_word_stats.json',
  'kanji_mnemonics.json',
  'pokopia_words.json',
  'global_lists.json'
];
const SERVER_AND_SEO_FILES = [
  '.htaccess',
  'robots.txt',
  'sitemap.xml',
  'studio_api.php',
  // Account, session, and sign-in code. studio_api.php requires both, so the
  // API returns a fatal error if they are missing from the deploy.
  'studio_accounts.php',
  'studio_oauth.php'
];

// Forbidden filenames and patterns that must NEVER enter /dist
const FORBIDDEN_NAME_PATTERNS = [
  /^\.env/i,
  /^config_check\.php$/i,
  /^admin_accounts\.php$/i,
  /^\.git/i,
  /^node_modules$/i,
  /^scripts$/i,
  /^ios-app$/i,
  /^expo-go-client$/i,
  /\.map$/i,
  /\.example\.php$/i,
  /\.md$/i,
  /^0$/,
  /\.DS_Store$/i,
  /config\.php$/i,
  /\.log$/i,
  /\.bak$/i,
  /\.sql$/i
];

// Sensitive content patterns for secret scanning
const SUSPICIOUS_SECRET_PATTERNS = [
  /OPENAI_API_KEY/i,
  /sk-[A-Za-z0-9-_]{20,}/,
  /STUDIO_API_ADMIN_PASSWORD\s*=\s*['"][^'"]+['"]/,
  /STUDIO_API_SYNC_TOKEN\s*=\s*['"][^'"]+['"]/,
  /STUDIO_API_WRITE_TOKEN\s*=\s*['"][^'"]+['"]/,
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/
];

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

async function copyDirectory(srcDir, destDir) {
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      await copyFile(srcPath, destPath);
    }
  }
}

async function build() {
  console.log('🚀 Starting safe production build...\n');
  const startTime = Date.now();

  // 1. Clean & recreate /dist
  console.log('🧹 Cleaning /dist directory...');
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  const statsTable = [];

  // 2. Minify HTML files
  console.log('📄 Minifying HTML files with html-minifier-terser...');
  for (const relPath of HTML_FILES) {
    const srcPath = path.join(rootDir, relPath);
    const destPath = path.join(distDir, relPath);
    await mkdir(path.dirname(destPath), { recursive: true });

    const rawContent = await readFile(srcPath, 'utf8');
    const minified = await minifyHTML(rawContent, {
      collapseWhitespace: true,
      removeComments: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      useShortDoctype: true,
      keepClosingSlash: true,
      ignoreCustomComments: [/^!/, /^\s*#/],
      minifyCSS: (text) => {
        const clean = new CleanCSS({ level: 1, sourceMap: false }).minify(text);
        return clean.styles || text;
      },
      minifyJS: {
        toplevel: false,
        compress: {
          passes: 1,
          drop_debugger: true,
          drop_console: false
        },
        mangle: false,
        format: { comments: false },
        sourceMap: false
      }
    });

    await writeFile(destPath, minified, 'utf8');
    statsTable.push({
      File: relPath,
      Original: formatBytes(Buffer.byteLength(rawContent)),
      Minified: formatBytes(Buffer.byteLength(minified)),
      Savings: (((Buffer.byteLength(rawContent) - Buffer.byteLength(minified)) / Buffer.byteLength(rawContent)) * 100).toFixed(1) + '%'
    });
  }

  // 3. Minify CSS files
  console.log('🎨 Minifying CSS files with clean-css...');
  const cleanCss = new CleanCSS({
    level: 1,
    sourceMap: false
  });

  for (const relPath of CSS_FILES) {
    const srcPath = path.join(rootDir, relPath);
    const destPath = path.join(distDir, relPath);
    await mkdir(path.dirname(destPath), { recursive: true });

    const rawContent = await readFile(srcPath, 'utf8');
    const result = cleanCss.minify(rawContent);

    if (result.errors && result.errors.length > 0) {
      throw new Error(`CSS minification failed for ${relPath}: ${result.errors.join(', ')}`);
    }

    await writeFile(destPath, result.styles, 'utf8');
    statsTable.push({
      File: relPath,
      Original: formatBytes(Buffer.byteLength(rawContent)),
      Minified: formatBytes(Buffer.byteLength(result.styles)),
      Savings: (((Buffer.byteLength(rawContent) - Buffer.byteLength(result.styles)) / Buffer.byteLength(rawContent)) * 100).toFixed(1) + '%'
    });
  }

  // 4. Minify JavaScript files (Conservative Terser compression & mangling)
  console.log('⚡ Minifying JavaScript files with Terser (conservative mode)...');
  for (const relPath of JS_FILES) {
    const srcPath = path.join(rootDir, relPath);
    const destPath = path.join(distDir, relPath);
    await mkdir(path.dirname(destPath), { recursive: true });

    const rawContent = await readFile(srcPath, 'utf8');
    const result = await minifyJS(rawContent, {
      toplevel: false,
      compress: {
        passes: 1,
        drop_debugger: true,
        drop_console: false
      },
      mangle: {
        keep_fnames: false
      },
      format: {
        comments: false
      },
      sourceMap: false
    });

    if (!result.code) {
      throw new Error(`Terser failed to produce output for ${relPath}`);
    }

    await writeFile(destPath, result.code, 'utf8');
    statsTable.push({
      File: relPath,
      Original: formatBytes(Buffer.byteLength(rawContent)),
      Minified: formatBytes(Buffer.byteLength(result.code)),
      Savings: (((Buffer.byteLength(rawContent) - Buffer.byteLength(result.code)) / Buffer.byteLength(rawContent)) * 100).toFixed(1) + '%'
    });
  }

  // 5. Copy public asset directories unchanged
  console.log('📁 Copying public asset directories unchanged...');
  for (const dirName of ASSET_DIRS) {
    const srcDir = path.join(rootDir, dirName);
    const destDir = path.join(distDir, dirName);
    if (existsSync(srcDir)) {
      await copyDirectory(srcDir, destDir);
      console.log(`   Copied ${dirName}/ -> dist/${dirName}/`);
    }
  }

  // 6. Copy public JSON data files unchanged
  console.log('📊 Copying public JSON data files unchanged...');
  for (const fileName of JSON_FILES) {
    const srcPath = path.join(rootDir, fileName);
    const destPath = path.join(distDir, fileName);
    if (existsSync(srcPath)) {
      await copyFile(srcPath, destPath);
      const size = (await stat(destPath)).size;
      statsTable.push({
        File: fileName,
        Original: formatBytes(size),
        Minified: formatBytes(size) + ' (raw)',
        Savings: '0.0%'
      });
    }
  }

  // 7. Copy web server and SEO files unchanged
  console.log('🔒 Copying web server configuration & SEO files unchanged...');
  for (const fileName of SERVER_AND_SEO_FILES) {
    const srcPath = path.join(rootDir, fileName);
    const destPath = path.join(distDir, fileName);
    if (existsSync(srcPath)) {
      await copyFile(srcPath, destPath);
      const size = (await stat(destPath)).size;
      statsTable.push({
        File: fileName,
        Original: formatBytes(size),
        Minified: formatBytes(size) + ' (raw)',
        Savings: '0.0%'
      });
    }
  }

  // 8. Post-build Verification & Safety Auditing
  console.log('\n🔍 Auditing /dist output for compliance and security...');

  async function getDistFiles(dir) {
    const subdirs = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      subdirs.map((entry) => {
        const res = path.resolve(dir, entry.name);
        return entry.isDirectory() ? getDistFiles(res) : res;
      })
    );
    return files.flat();
  }

  const allDistFiles = await getDistFiles(distDir);
  let validationErrors = 0;

  for (const filePath of allDistFiles) {
    const relativeToDist = path.relative(distDir, filePath);
    const baseName = path.basename(filePath);

    // Rule: Never generate source maps or include .map files
    if (filePath.endsWith('.map')) {
      console.error(`❌ FORBIDDEN: Found source map in production output: ${relativeToDist}`);
      validationErrors++;
    }

    // Rule: Check forbidden filenames
    for (const pattern of FORBIDDEN_NAME_PATTERNS) {
      if (pattern.test(baseName) || pattern.test(relativeToDist)) {
        console.error(`❌ FORBIDDEN: Found disallowed file in production output: ${relativeToDist}`);
        validationErrors++;
      }
    }

    // Rule: Secret scanning inside text files
    const ext = path.extname(filePath).toLowerCase();
    if (['.html', '.js', '.css', '.json', '.php', '.txt', '.xml'].includes(ext)) {
      const content = await readFile(filePath, 'utf8');
      for (const secretRegex of SUSPICIOUS_SECRET_PATTERNS) {
        if (secretRegex.test(content)) {
          console.error(`❌ SECURITY ALERT: File ${relativeToDist} matched suspicious secret pattern: ${secretRegex}`);
          validationErrors++;
        }
      }
    }
  }

  if (validationErrors > 0) {
    throw new Error(`Build audit failed with ${validationErrors} violations. Aborting.`);
  }

  console.log('✅ Audit passed: Zero source maps, zero forbidden files, zero detected secrets.');

  // Summary Table
  console.log('\n📊 Production Build Summary:');
  console.table(statsTable);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`✨ Build completed successfully in ${duration}s.`);
  console.log(`📦 Output ready at: ${distDir}\n`);
}

build().catch((err) => {
  console.error('\n❌ Build failed:', err);
  process.exit(1);
});
