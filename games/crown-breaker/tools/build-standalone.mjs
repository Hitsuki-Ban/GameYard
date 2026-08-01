import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv.length !== 3) {
  console.error("Usage: node tools/build-standalone.mjs <output.html>");
  console.error("Exactly one output path is required.");
  process.exit(1);
}

const root = fileURLToPath(new URL("..", import.meta.url));
const output = resolve(process.argv[2]);

function replaceExactlyOnce(source, pattern, replacement, label) {
  let count = 0;
  const result = source.replace(pattern, (...args) => {
    count += 1;
    return typeof replacement === "function" ? replacement(...args) : replacement;
  });
  if (count !== 1) {
    throw new Error(`Expected exactly one ${label}; found ${count}.`);
  }
  return result;
}

function removeExactlyOnce(source, pattern, label) {
  return replaceExactlyOnce(source, pattern, "", label);
}

function escapeInlineScript(source) {
  return source.replace(/<\/script/gi, "<\\/script");
}

function escapeInlineStyle(source) {
  return source.replace(/<\/style/gi, "<\\/style");
}

function assertRawTextEscaped(source, tagName) {
  if (new RegExp(`<\\/${tagName}`, "i").test(source)) {
    throw new Error(`Inline ${tagName} content contains an unescaped closing tag.`);
  }
}

function assertInlineCssResources(source, expectedDataUrls) {
  if (source.includes("\\")) throw new Error("Standalone CSS must not contain escapes.");
  if (/@import\b/i.test(source)) throw new Error("Standalone CSS must not contain @import.");
  if (/(?:^|[^\w-])(?:-webkit-)?image-set\s*\(/i.test(source)) {
    throw new Error("Standalone CSS must not contain image-set().");
  }
  const tokens = [];
  const tokenPattern = /\burl\s*\(\s*(?:(["'])(.*?)\1|([^"'()]*))\s*\)/gi;
  for (const match of source.matchAll(tokenPattern)) {
    const value = (match[2] ?? match[3] ?? "").trim();
    if (!value || !/^data:image\/svg\+xml;base64,/i.test(value)) {
      throw new Error(`Standalone CSS contains a non-data URL: ${value || "<empty>"}.`);
    }
    tokens.push(value);
  }
  const starts = source.match(/\burl\s*\(/gi) || [];
  if (tokens.length !== starts.length)
    throw new Error("Standalone CSS contains a malformed url() token.");
  if (tokens.length !== expectedDataUrls) {
    throw new Error(
      `Standalone CSS must contain exactly ${expectedDataUrls} data URLs; found ${tokens.length}.`,
    );
  }
}

function assertInlineCssRejected(source, label) {
  try {
    assertInlineCssResources(source, 0);
  } catch {
    return;
  }
  throw new Error(`Standalone CSS guard accepted ${label}.`);
}

assertRawTextEscaped(escapeInlineScript("</SCRIPT></ScRiPt>"), "script");
assertRawTextEscaped(escapeInlineStyle("</STYLE></StYlE>"), "style");
assertInlineCssRejected(
  '.probe{background-image:u\\72l("https://example.invalid/pixel")}',
  "an escaped url() identifier",
);
assertInlineCssRejected(
  '@im\\70ort "https://example.invalid/style.css";',
  "an escaped @import identifier",
);
assertInlineCssRejected(
  '.probe{background-image:image-set("https://example.invalid/image.png" 1x)}',
  "an image-set() URL",
);

const actAssetPaths = Object.freeze([
  "assets/acts/outer.svg",
  "assets/acts/outer-particles.svg",
  "assets/acts/gallery.svg",
  "assets/acts/gallery-particles.svg",
  "assets/acts/throne.svg",
  "assets/acts/throne-particles.svg",
]);

let html = await readFile(resolve(root, "index.html"), "utf8");
let css = await readFile(resolve(root, "styles.css"), "utf8");
for (const assetPath of actAssetPaths) {
  const encoded = (await readFile(resolve(root, assetPath))).toString("base64");
  css = replaceExactlyOnce(
    css,
    `url("./${assetPath}")`,
    `url("data:image/svg+xml;base64,${encoded}")`,
    `CSS reference to ./${assetPath}`,
  );
}
if (css.includes("./assets/acts/")) {
  throw new Error("Standalone CSS still contains an ./assets/acts/ resource reference.");
}
assertInlineCssResources(css, actAssetPaths.length);
css = escapeInlineStyle(css);
assertRawTextEscaped(css, "style");
const i18n = escapeInlineScript(await readFile(resolve(root, "i18n.js"), "utf8"));
assertRawTextEscaped(i18n, "script");
const icon = (await readFile(resolve(root, "icon-192.png"))).toString("base64");
const gameSource = await readFile(resolve(root, "game.js"), "utf8");
let standaloneGame = replaceExactlyOnce(
  gameSource,
  /\r?\n  function installTestHooks\(\) \{[\s\S]*?\r?\n  \}\r?\n\r?\n  function init\(\)/g,
  "\n\n  function init()",
  "installTestHooks() definition in game.js",
);
standaloneGame = removeExactlyOnce(
  standaloneGame,
  /^[ \t]*const qaMode = globalThis\.__CB_ENABLE_QA__ === true \|\| new URLSearchParams\(location\.search\)\.has\(['"]qa['"]\);\r?\n[ \t]*if \(qaMode\) installTestHooks\(\);\r?\n/gm,
  "QA installation lines in init()",
);
standaloneGame = removeExactlyOnce(
  standaloneGame,
  /^[ \t]*if \(['"]serviceWorker['"] in navigator && location\.protocol !== ['"]file:['"]\) \{\r?\n[ \t]*navigator\.serviceWorker\.register\(['"]\.\/sw\.js['"]\)\.catch\(\(\) => \{\}\);\r?\n[ \t]*\}\r?\n/gm,
  "service worker registration block in game.js",
);
const forbiddenProductionPatterns = Object.freeze([
  [/__CB_TEST__/, "__CB_TEST__"],
  [/__CB_ENABLE_QA__/, "__CB_ENABLE_QA__"],
  [/\binstallTestHooks\b/, "installTestHooks"],
  [/\bconfigureBattle\b/, "configureBattle"],
  [/\bresetStorage\b/, "resetStorage"],
  [/\b(?:navigator\.)?serviceWorker\s*\.\s*register\s*\(/, "service worker registration"],
]);
for (const [pattern, label] of forbiddenProductionPatterns) {
  if (pattern.test(standaloneGame)) throw new Error(`Standalone game still contains ${label}.`);
}
const game = escapeInlineScript(standaloneGame);
assertRawTextEscaped(game, "script");

html = removeExactlyOnce(
  html,
  /^[ \t]*<link\b(?=[^>]*\brel=["']manifest["'])[^>]*>[ \t]*\r?\n?/gim,
  "manifest link",
);
html = replaceExactlyOnce(
  html,
  /^[ \t]*<link\b(?=[^>]*\brel=["']icon["'])[^>]*>[ \t]*\r?\n?/gim,
  `  <link rel="icon" href="data:image/png;base64,${icon}">\n`,
  "icon link",
);
html = removeExactlyOnce(
  html,
  /^[ \t]*<link\b(?=[^>]*\brel=["']apple-touch-icon["'])[^>]*>[ \t]*\r?\n?/gim,
  "apple-touch-icon link",
);
html = replaceExactlyOnce(
  html,
  /^[ \t]*<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["'](?:\.\/)?styles\.css["'])[^>]*>[ \t]*\r?\n?/gim,
  `  <style>\n${css}\n  </style>\n`,
  "styles.css link",
);
html = replaceExactlyOnce(
  html,
  /^[ \t]*<script\b(?=[^>]*\bsrc=["'](?:\.\/)?i18n\.js["'])[^>]*>\s*<\/script>[ \t]*\r?\n?/gim,
  `  <script>\n${i18n}\n  </script>\n`,
  "i18n.js script",
);
html = replaceExactlyOnce(
  html,
  /^[ \t]*<script\b(?=[^>]*\bsrc=["'](?:\.\/)?game\.js["'])[^>]*>\s*<\/script>[ \t]*\r?\n?/gim,
  `  <script>\n${game}\n  </script>\n`,
  "game.js script",
);

if (
  /<script\b[^>]*\bsrc\s*=|<link\b[^>]*\bhref\s*=\s*["'](?!data:)[^"']+|<link\b[^>]*\bimagesrcset\s*=|<(?:img|audio|video|source)\b[^>]*\bsrc\s*=/i.test(
    html,
  )
) {
  throw new Error("Standalone output still contains an external resource reference.");
}
if (html.includes("./assets/acts/")) {
  throw new Error("Standalone output still contains an ./assets/acts/ resource reference.");
}
for (const [pattern, label] of forbiddenProductionPatterns) {
  if (pattern.test(html)) throw new Error(`Standalone output still contains ${label}.`);
}

await mkdir(dirname(output), { recursive: true });
await writeFile(output, html, "utf8");
console.log(output);
