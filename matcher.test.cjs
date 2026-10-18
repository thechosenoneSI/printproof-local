'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { analyze } = require('./matcher.js');
const approved = ['RIVERSIDE MAKERS MARKET', 'Saturday 24 October 2026', 'Open 10:00 - 18:00', 'Entry $12', 'Call 202-555-0147', '48 River Street', 'Free parking'];
function ocr(texts, confidence = 95) {
  const words = [], lines = texts.map((text, y) => {
    let x = 10;
    const ws = text.split(/\s+/).filter(Boolean).map(text => {
      const word = { text, confidence, bbox: { x0: x, y0: y * 40, x1: x + text.length * 10, y1: y * 40 + 24 } };
      x = word.bbox.x1 + 10; words.push(word); return word;
    });
    return { text, confidence, bbox: { x0: 10, y0: y * 40, x1: x, y1: y * 40 + 24 }, words: ws };
  });
  return { text: texts.join('\n'), confidence, words, lines };
}
test('exact clean control matches every approved line', () => {
  assert.deepEqual(analyze(approved.join('\n'), ocr(approved)), { findings: [], matchedCount: 7, expectedCount: 7 });
});
test('changed date, transposed price, phone and missing parking produce only four findings', () => {
  const actual = [...approved]; actual[1] = 'Saturday 25 October 2026'; actual[3] = 'Entry $21'; actual[4] = 'Call 202-555-0141'; actual.pop();
  const r = analyze(approved, ocr(actual));
  assert.equal(r.matchedCount, 3); assert.equal(r.findings.length, 4);
  for (const expected of [approved[1], approved[3], approved[4]]) {
    const f = r.findings.find(f => f.expected === expected);
    assert.equal(f.kind, 'changed'); assert.equal(f.severity, 'critical'); assert.ok(f.bbox);
  }
  const missing = r.findings.find(f => f.expected === 'Free parking');
  assert.equal(missing.kind, 'missing'); assert.equal(missing.bbox, null);
});
test('case, whitespace, curly quotes and dash variants normalize without dropping punctuation', () => {
  const a = ['Maker’s “Market”', 'Open 10:00 - 18:00', 'Entry $12', 'hello@example.com'];
  const b = ['  MAKER\'S   "market" ', 'OPEN  10:00–18:00', 'Entry $ 12', 'HELLO @ EXAMPLE . COM'];
  assert.equal(analyze(a, ocr(b)).findings.length, 0);
});
test('wrapped lines match one approved phrase', () => {
  const r = analyze('Saturday 24 October 2026\nFree parking', ocr(['Saturday 24', 'October 2026', 'Free parking']));
  assert.equal(r.matchedCount, 2); assert.deepEqual(r.findings, []);
});
test('a wrapped phrase with a changed digit produces one finding', () => {
  const r = analyze('Saturday 24 October 2026', ocr(['Saturday 25', 'October 2026']));
  assert.equal(r.findings.length, 1); assert.equal(r.findings[0].kind, 'changed');
});
test('blank OCR is explicitly uncertain, never a clean result', () => {
  const r = analyze(approved, { text: '', words: [], lines: [] });
  assert.equal(r.matchedCount, 0); assert.equal(r.expectedCount, 7);
  assert.equal(r.findings.length, 1); assert.equal(r.findings[0].kind, 'uncertain'); assert.equal(r.findings[0].confidence, 0);
});
test('repeated approved lines cannot reuse one occurrence', () => {
  const r = analyze('Free parking\nFree parking', ocr(['Free parking']));
  assert.equal(r.matchedCount, 1); assert.equal(r.findings.length, 1); assert.equal(r.findings[0].kind, 'missing');
  assert.equal(analyze('Free parking\nFree parking', ocr(['Free parking', 'Free parking'])).matchedCount, 2);
});
test('low confidence exact text remains uncertain', () => {
  const r = analyze('Entry $12', ocr(['Entry $12'], 45));
  assert.equal(r.matchedCount, 0); assert.equal(r.findings[0].kind, 'uncertain'); assert.equal(r.findings[0].severity, 'review');
});
test('one low confidence digit is not masked by a high line confidence', () => {
  const data = ocr(['Entry $21']); data.words[1].confidence = 36;
  const r = analyze('Entry $12', data);
  assert.equal(r.findings[0].kind, 'uncertain'); assert.equal(r.findings[0].confidence, 36);
});
test('numeric, decimal, email punctuation changes stay meaningful', () => {
  for (const [expected, observed] of [['12', '21'], ['Entry $1.20', 'Entry $120'], ['Email hello@example.com', 'Email hello@example,com']]) {
    const r = analyze(expected, ocr([observed]));
    assert.equal(r.matchedCount, 0); assert.ok(r.findings.length); assert.equal(r.findings[0].kind, 'changed');
  }
});
test('changed word is highlighted once', () => {
  const r = analyze('48 River Street', ocr(['48 River Road']));
  assert.equal(r.findings.length, 1); assert.equal(r.findings[0].kind, 'changed');
  assert.deepEqual(r.findings[0].bbox, ocr(['48 River Road']).words[2].bbox);
});
test('unrelated lines are not reported as matching changes', () => {
  const r = analyze('Free parking', ocr(['Call 202-555-0147', 'Saturday 24 October 2026']));
  assert.equal(r.findings[0].kind, 'missing'); assert.equal(r.findings[0].observed, '');
});
test('exact lines are reserved before fuzzy lines', () => {
  const r = analyze('Free parking\nFree shipping', ocr(['Free shipping']));
  assert.equal(r.matchedCount, 1); assert.equal(r.findings.length, 1); assert.equal(r.findings[0].expected, 'Free parking');
});
test('unknown confidence produces uncertainty rather than apparent approval', () => {
  const r = analyze('Free parking', { lines: [{ text: 'Free parking' }] });
  assert.equal(r.findings[0].kind, 'uncertain'); assert.equal(r.matchedCount, 0);
});
test('actual saved neural OCR: clean 7/7 and precisely four planted differences', () => {
  const results = JSON.parse(fs.readFileSync(__dirname + '/results.json', 'utf8'));
  const clean = analyze(results.approved, results.checks.find(x => x.fixture === 'clean-control'));
  const planted = analyze(results.approved, results.checks.find(x => x.fixture === 'planted-errors'));
  assert.equal(clean.matchedCount, 7); assert.equal(clean.findings.length, 0);
  assert.equal(planted.findings.length, 4); assert.equal(planted.findings.filter(f => f.kind === 'changed').length, 3);
  assert.equal(planted.findings.find(f => f.kind === 'missing').expected, 'Free parking');
});
test('UMD exposes the same browser API without module or network dependencies', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(__dirname + '/matcher.js', 'utf8'), sandbox);
  assert.equal(typeof sandbox.window.PrintProofMatcher.analyze, 'function');
  assert.equal(sandbox.window.PrintProofMatcher.analyze('Entry $12', ocr(['Entry $12'])).matchedCount, 1);
});
test('added negation cannot silently turn an approved phrase into a clean match', () => {
  const r = analyze('Free parking', ocr(['No free parking']));
  assert.equal(r.matchedCount, 0); assert.equal(r.findings[0].kind, 'uncertain');
});
test('OCR combining two approved lines can still match them one-to-one', () => {
  const r = analyze('Free parking\nEntry $12', ocr(['Free parking Entry $12']));
  assert.equal(r.matchedCount, 2); assert.equal(r.findings.length, 0);
});
test('similar alternative OCR locations are review uncertainty', () => {
  const r = analyze('Entry $12', ocr(['Entry $21', 'Entry $22']));
  assert.equal(r.findings.length, 1); assert.equal(r.findings[0].kind, 'uncertain');
});
test('OCR-split extra decimal punctuation is not ignored', () => {
  const r = analyze('Entry $12', ocr(['Entry $12 . 50']));
  assert.equal(r.matchedCount, 0); assert.ok(r.findings.length);
});
test('normalization and analysis do not mutate supplied OCR objects', () => {
  const data = ocr(['Entry $21']); const before = JSON.stringify(data);
  analyze('Entry $12', data); assert.equal(JSON.stringify(data), before);
});
test('exact phrase wrapped across four lines is recognized', () => {
  const result = analyze('Please bring your printed ticket to reception',
    ocr(['Please bring', 'your printed', 'ticket to', 'reception']));
  assert.equal(result.matchedCount, 1);
  assert.equal(result.findings.length, 0);
});
test('extra negation around a four-line exact phrase remains a review flag', () => {
  const result = analyze('Please bring your printed ticket to reception',
    ocr(['Do not Please bring', 'your printed', 'ticket to', 'reception']));
  assert.equal(result.matchedCount, 0);
  assert.ok(result.findings.length > 0);
});
test('four-line exact matching does not reuse a repeated phrase', () => {
  const phrase = 'Please bring your printed ticket to reception';
  const result = analyze(phrase + '\n' + phrase,
    ocr(['Please bring', 'your printed', 'ticket to', 'reception']));
  assert.equal(result.matchedCount, 1);
  assert.equal(result.findings.length, 1);
});
