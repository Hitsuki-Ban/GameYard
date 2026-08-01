import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = await readFile(resolve(root, 'i18n.js'), 'utf8');

function loadI18n(navigator) {
  const context = {};
  if (navigator !== undefined) context.navigator = navigator;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'i18n.js' });
  return context.CrownBreakerI18n;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertThrows(fn, label) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(`${label} did not fail`);
}

const cases = [
  { languages: ['fr-FR', 'ja-JP'], language: 'en-US', expected: 'ja' },
  { languages: ['zh-Hant-TW', 'en-US'], language: 'en-US', expected: 'zh-CN' },
  { languages: ['de-DE', 'fr-FR'], language: 'de-DE', expected: 'en' },
  { languages: [], language: 'en-GB', expected: 'en' },
];

for (const test of cases) {
  const i18n = loadI18n({ languages: test.languages, language: test.language });
  assert(i18n.resolveLocale('system') === test.expected, `${test.languages.join(',')} did not resolve to ${test.expected}`);
}

assert(loadI18n(undefined).resolveLocale('system') === 'en', 'Missing navigator must resolve to English');

const explicit = loadI18n({ languages: ['ja-JP'], language: 'ja-JP' });
for (const locale of ['zh-CN', 'ja', 'en']) {
  assert(explicit.resolveLocale(locale) === locale, `Explicit ${locale} preference was not preserved`);
}

assert(Object.isFrozen(explicit.catalogs), 'Catalogs must be frozen');
assert(explicit.translate('en', 'meta.title').includes('CROWN//BREAKER'), 'English title translation is missing');
assert(explicit.translate('zh-CN', 'meta.title').includes('CROWN//BREAKER'), 'Chinese title translation is missing');
assert(explicit.translate('ja', 'meta.title').includes('CROWN//BREAKER'), 'Japanese title translation is missing');
assert(explicit.translate('en', 'result.seed', { seed: '000022B8' }) === 'SEED 000022B8', 'English seed label is invalid');
assert(explicit.translate('zh-CN', 'result.seed', { seed: '000022B8' }) === '种子 000022B8', 'Chinese seed label is invalid');
assert(explicit.translate('ja', 'result.seed', { seed: '000022B8' }) === 'シード 000022B8', 'Japanese seed label is invalid');

assertThrows(() => explicit.translate('en', '__missing__'), 'Missing translation key');
assertThrows(() => explicit.translate('en', 'banner.battle'), 'Missing interpolation parameter');
assertThrows(() => explicit.resolveLocale('fr'), 'Unsupported preference');

console.log('i18n checks passed (device negotiation, explicit preferences, strict catalogs).');
