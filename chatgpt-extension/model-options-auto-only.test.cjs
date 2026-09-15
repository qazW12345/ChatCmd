const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'content-chatgpt-models.js'), 'utf8');

test('Auto-only discovery is treated as a failed model discovery', () => {
  assert.match(source, /const nonAutoModels = model\.options\.filter/);
  assert.match(source, /if \(!nonAutoModels\.length\)/);
  assert.match(source, /No non-Auto ChatGPT model choices were discovered/);
});

test('reasoning Auto control is not accepted as a model switcher fallback', () => {
  assert.match(source, /if \(\/reasoning\|thinking\/i\.test\(metadata\)\) return false/);
  assert.doesNotMatch(source, /\/\^auto\$\/i\.test\(label\) \|\| looksLikeModelLabel\(label\)/);
});
