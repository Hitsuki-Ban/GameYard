import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv.length !== 3) {
  console.error('Usage: node tools/build-standalone.mjs <output.html>');
  console.error('Exactly one output path is required.');
  process.exit(1);
}

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(process.argv[2]);

function replaceExactlyOnce(source, pattern, replacement, label) {
  let count = 0;
  const result = source.replace(pattern, (...args) => {
    count += 1;
    return typeof replacement === 'function' ? replacement(...args) : replacement;
  });
  if (count !== 1) {
    throw new Error(`Expected exactly one ${label}; found ${count}.`);
  }
  return result;
}

function removeExactlyOnce(source, pattern, label) {
  return replaceExactlyOnce(source, pattern, '', label);
}

function escapeInlineScript(source) {
  return source.replaceAll('</script', '<\\/script');
}

let html = await readFile(resolve(root, 'index.html'), 'utf8');
const css = await readFile(resolve(root, 'styles.css'), 'utf8');
const i18n = escapeInlineScript(await readFile(resolve(root, 'i18n.js'), 'utf8'));
const icon = (await readFile(resolve(root, 'icon-192.png'))).toString('base64');
const gameSource = await readFile(resolve(root, 'game.js'), 'utf8');
const standaloneGame = replaceExactlyOnce(
  gameSource,
  /^[ \t]*if \(['"]serviceWorker['"] in navigator && location\.protocol !== ['"]file:['"]\) \{\r?\n[ \t]*navigator\.serviceWorker\.register\(['"]\.\/sw\.js['"]\)\.catch\(\(\) => \{\}\);\r?\n[ \t]*\}\r?\n/gm,
  '',
  'service worker registration block in game.js',
);
const game = escapeInlineScript(standaloneGame);

html = removeExactlyOnce(
  html,
  /^[ \t]*<link\b(?=[^>]*\brel=["']manifest["'])[^>]*>[ \t]*\r?\n?/gim,
  'manifest link',
);
html = replaceExactlyOnce(
  html,
  /^[ \t]*<link\b(?=[^>]*\brel=["']icon["'])[^>]*>[ \t]*\r?\n?/gim,
  `  <link rel="icon" href="data:image/png;base64,${icon}">\n`,
  'icon link',
);
html = removeExactlyOnce(
  html,
  /^[ \t]*<link\b(?=[^>]*\brel=["']apple-touch-icon["'])[^>]*>[ \t]*\r?\n?/gim,
  'apple-touch-icon link',
);
html = replaceExactlyOnce(
  html,
  /^[ \t]*<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["'](?:\.\/)?styles\.css["'])[^>]*>[ \t]*\r?\n?/gim,
  `  <style>\n${css}\n  </style>\n`,
  'styles.css link',
);
html = replaceExactlyOnce(
  html,
  /^[ \t]*<script\b(?=[^>]*\bsrc=["'](?:\.\/)?i18n\.js["'])[^>]*>\s*<\/script>[ \t]*\r?\n?/gim,
  `  <script>\n${i18n}\n  </script>\n`,
  'i18n.js script',
);
html = replaceExactlyOnce(
  html,
  /^[ \t]*<script\b(?=[^>]*\bsrc=["'](?:\.\/)?game\.js["'])[^>]*>\s*<\/script>[ \t]*\r?\n?/gim,
  `  <script>\n${game}\n  </script>\n`,
  'game.js script',
);

if (/<script\b[^>]*\bsrc\s*=|<link\b[^>]*\bhref\s*=\s*["'](?!data:)[^"']+|<link\b[^>]*\bimagesrcset\s*=|<(?:img|audio|video|source)\b[^>]*\bsrc\s*=/i.test(html)) {
  throw new Error('Standalone output still contains an external resource reference.');
}

await mkdir(dirname(output), { recursive: true });
await writeFile(output, html, 'utf8');
console.log(output);
