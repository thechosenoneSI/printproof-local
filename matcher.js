/* Browser-local OCR suggestions only. A match is not a print approval.
 * confidence is OCR recognition quality, not the probability of a print error.
 * Missing text has no inferred image location; its bbox is null. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PrintProofMatcher = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LOW = 70;
  const clean = text => String(text || '').normalize('NFKC')
    .replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[‐‑‒–—−]/g, '-')
    .replace(/\s+/g, ' ').trim();
  const normalize = text => clean(text).toLowerCase();
  const displayTokens = text => clean(text).match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*|[^\s]/gu) || [];
  // Punctuation remains significant; spacing around it does not. Digits never sort.
  const tokens = text => normalize(text).match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*|[^\s]/gu) || [];
  const key = ts => ts.map(t => typeof t === 'string' ? t : t.value).join('\u0001');
  const risky = text => /[\d$£€¥₹@]/u.test(text);
  const box = b => b && ['x0', 'y0', 'x1', 'y1'].every(k => Number.isFinite(b[k])) ? b : null;
  const union = bs => {
    bs = bs.map(box).filter(Boolean);
    return bs.length ? { x0: Math.min(...bs.map(b => b.x0)), y0: Math.min(...bs.map(b => b.y0)),
      x1: Math.max(...bs.map(b => b.x1)), y1: Math.max(...bs.map(b => b.y1)) } : null;
  };
  const conf = (v, fallback = 0) => Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : fallback;
  const distance = (a, b) => {
    let row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const next = [i];
      for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] !== b[j - 1]));
      row = next;
    }
    return row[b.length];
  };
  function prepare(data) {
    const words = (data.words || []).filter(w => normalize(w.text));
    let lines = (data.lines || []).filter(l => normalize(l.text));
    if (!lines.length && words.length && words.every(w => box(w.bbox))) {
      // Tesseract words are already in reading order. Keep columns/order intact.
      const groups = [];
      for (const word of words) {
        const last = groups[groups.length - 1], b = word.bbox, a = last && last.bbox;
        const overlap = a ? Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) : 0;
        if (a && overlap > Math.min(a.y1 - a.y0, b.y1 - b.y0) * .35) {
          last.words.push(word); last.text += ' ' + word.text; last.bbox = union([a, b]);
        } else groups.push({ text: word.text, bbox: b, words: [word] });
      }
      lines = groups;
    }
    if (!lines.length) lines = String(data.text || '').split(/\r?\n/).filter(s => s.trim()).map(text => ({ text }));
    if (!lines.length && words.length) lines = [{ text: words.map(w => w.text).join(' '), words }];
    let id = 0;
    return lines.map((line, lineIndex) => {
      const b = box(line.bbox), lc = conf(line.confidence, conf(data.confidence));
      const ws = line.words || words.filter(w => {
        const wb = box(w.bbox);
        return b && wb && (wb.x0 + wb.x1) / 2 >= b.x0 && (wb.x0 + wb.x1) / 2 <= b.x1 &&
          (wb.y0 + wb.y1) / 2 >= b.y0 && (wb.y0 + wb.y1) / 2 <= b.y1;
      });
      const wt = ws.flatMap(w => displayTokens(w.text).map(display => ({ value: display.toLowerCase(), display, confidence: conf(w.confidence, lc), bbox: box(w.bbox) })));
      const lt = tokens(line.text);
      const displays = displayTokens(line.text);
      const ts = key(wt) === key(lt) ? wt : lt.map((value, i) => ({ value, display: displays[i], confidence: lc, bbox: b }));
      return { text: line.text, index: lineIndex, tokens: ts.map(t => ({ ...t, id: id++, line: lineIndex })) };
    }).filter(l => l.tokens.length);
  }
  function candidateList(lines, expected) {
    const candidates = [], seen = new Set(), n = expected.length;
    const add = ts => {
      if (!ts.length) return;
      const id = ts[0].id + ':' + ts[ts.length - 1].id;
      if (seen.has(id)) return;
      seen.add(id);
      candidates.push({ tokens: ts, values: ts.map(t => t.value), id,
        confidence: Math.min(...ts.map(t => t.confidence)), bbox: union(ts.map(t => t.bbox)) });
    };
    // Exact phrases may wrap across any number of adjacent OCR lines.
    // Keep fuzzy search bounded below; this linear scan does not multiply
    // expensive edit-distance comparisons for long or dense artwork.
    const stream = lines.flatMap(line => line.tokens);
    for (let start = 0; start + n <= stream.length; start++) {
      if (expected.every((value, offset) => stream[start + offset].value === value)) {
        add(stream.slice(start, start + n));
      }
    }
    for (let i = 0; i < lines.length; i++) {
      let merged = [];
      for (let j = i; j < Math.min(lines.length, i + 3); j++) {
        merged = merged.concat(lines[j].tokens);
        if (merged.length <= n * 1.6 + 2) add(merged);
        // A phrase may be embedded in an OCR line or wrap across adjacent lines.
        for (let start = 0; start < merged.length; start++) {
          for (let len = Math.max(1, n - 1); len <= n + 1 && start + len <= merged.length; len++) {
            // Partial windows require complete-word boundaries (punctuation kept).
            const ts = merged.slice(start, start + len);
            if (start > 0 && ts[0].bbox && ts[0].bbox === merged[start - 1].bbox) continue;
            if (start + len < merged.length && ts[ts.length - 1].bbox && ts[ts.length - 1].bbox === merged[start + len].bbox) continue;
            add(ts);
          }
        }
      }
    }
    return candidates;
  }
  function similarity(e, c, onlyPair) {
    if (key(e) === key(c)) return 1;
    if (Math.min(e.length, c.length) / Math.max(e.length, c.length) < .5) return 0;
    const es = e.join(' '), cs = c.join(' ');
    const alpha = t => /\p{L}/u.test(t);
    const common = e.filter(t => alpha(t) && c.includes(t)).length;
    const singleWord = e.length === 1 && c.length === 1 && alpha(e[0]);
    const numericPair = onlyPair && risky(es) && risky(cs) &&
      es.replace(/\d+/g, '#') === cs.replace(/\d+/g, '#');
    if (!common && !singleWord && !numericPair) return 0;
    const chars = 1 - distance(es, cs) / Math.max(es.length, cs.length);
    if ((!common && singleWord && chars < .75) || (!numericPair && chars < .35)) return 0;
    const edit = 1 - distance(e, c) / Math.max(e.length, c.length);
    return numericPair ? Math.max(.65, .6 * chars + .4 * edit) : .6 * chars + .4 * edit;
  }
  function differingBox(expected, candidate) {
    // Backtrack token edit alignment to highlight changed OCR words, not invented positions.
    const actual = candidate.values, dp = Array.from({ length: expected.length + 1 }, () => []);
    for (let i = 0; i <= expected.length; i++) dp[i][0] = i;
    for (let j = 0; j <= actual.length; j++) dp[0][j] = j;
    for (let i = 1; i <= expected.length; i++) for (let j = 1; j <= actual.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (expected[i - 1] !== actual[j - 1]));
    let i = expected.length, j = actual.length;
    const changed = [];
    while (i || j) {
      if (i && j && dp[i][j] === dp[i - 1][j - 1] + (expected[i - 1] !== actual[j - 1])) {
        if (expected[i - 1] !== actual[j - 1]) changed.push(candidate.tokens[j - 1].bbox);
        i--; j--;
      } else if (j && dp[i][j] === dp[i][j - 1] + 1) { changed.push(candidate.tokens[j - 1].bbox); j--; }
      else i--;
    }
    return union(changed) || candidate.bbox;
  }
  function analyze(approvedText, ocrData) {
    const approved = (Array.isArray(approvedText) ? approvedText : String(approvedText || '').split(/\r?\n/))
      .map(s => String(s).trim()).filter(Boolean).map((text, index) => ({ text, index, tokens: tokens(text) }));
    const findings = [], data = ocrData || {}, lines = prepare(data);
    const result = { findings, matchedCount: 0, expectedCount: approved.length };
    if (!approved.length) return result;
    if (!lines.length) {
      findings.push({ kind: 'uncertain', severity: 'review', expected: approved.map(e => e.text).join('\n'), observed: '',
        confidence: 0, bbox: null, reason: 'No readable OCR text was returned. Check the image and compare the artwork manually.' });
      return result;
    }
    const used = new Set(), matched = new Map(), edges = [], cache = new Map();
    const candidates = e => {
      if (!cache.has(e.tokens.length)) cache.set(e.tokens.length, candidateList(lines, e.tokens));
      return cache.get(e.tokens.length);
    };
    const assign = pending => {
      pending.sort((a, b) => b.score - a.score || Number(risky(b.e.text)) - Number(risky(a.e.text)) ||
        a.e.index - b.e.index || a.c.tokens[0].id - b.c.tokens[0].id);
      for (const edge of pending) {
        if (matched.has(edge.e.index) || edge.c.tokens.some(t => used.has(t.id))) continue;
        matched.set(edge.e.index, edge);
        edge.c.tokens.forEach(t => used.add(t.id));
      }
    };
    // Reserve exact evidence before spending time on fuzzy candidates.
    for (const e of approved) for (const c of candidates(e)) {
      if (key(e.tokens) === key(c.values)) edges.push({ e, c, score: 1 });
    }
    assign(edges);
    const fuzzy = [];
    for (const e of approved) if (!matched.has(e.index)) for (const c of candidates(e)) {
      if (c.tokens.some(t => used.has(t.id))) continue;
      const score = similarity(e.tokens, c.values, approved.length === 1 && lines.length === 1);
      if (score >= .48) fuzzy.push({ e, c, score });
    }
    assign(fuzzy); edges.push(...fuzzy);
    const all = lines.flatMap(l => l.tokens);
    const overallConfidence = all.reduce((s, t) => s + t.confidence, 0) / all.length;
    for (const e of approved) {
      const edge = matched.get(e.index);
      if (!edge) {
        const uncertain = overallConfidence < LOW;
        findings.push({ kind: uncertain ? 'uncertain' : 'missing', severity: !uncertain && risky(e.text) ? 'critical' : 'review',
          expected: e.text, observed: '', confidence: Math.round(overallConfidence), bbox: null,
          reason: uncertain ? 'OCR quality is too low to establish whether this approved text is present. Review the artwork.' :
            'This approved text was not located in the OCR. It may be missing or unreadable; verify it on the artwork.' });
        continue;
      }
      const { c, score } = edge, low = c.confidence < LOW;
      const touched = new Set(c.tokens.map(t => t.line));
      const extraContext = lines.some(l => touched.has(l.index) && l.tokens.some(t => !used.has(t.id)));
      const ambiguous = score < 1 && edges.some(other => other.e.index === e.index && other.c.id !== c.id &&
        Math.abs(other.score - score) < .08 && other.c.tokens.every(t => !used.has(t.id)));
      if (score === 1 && !low && !extraContext) { result.matchedCount++; continue; }
      const uncertain = low || score < .60 || ambiguous || extraContext;
      findings.push({ kind: uncertain ? 'uncertain' : 'changed', severity: !uncertain && (risky(e.text) || risky(c.values.join(' '))) ? 'critical' : 'review',
        expected: e.text, observed: c.tokens.map(t => t.display).join(' ')
          .replace(/\s*([@.:/\-])\s*/g, '$1').replace(/([$£€¥₹])\s+(?=\d)/g, '$1')
          .replace(/\s+([,;!?])/g, '$1'), confidence: Math.floor(c.confidence),
        bbox: score === 1 ? c.bbox : differingBox(e.tokens, c), reason: low ?
          'OCR confidence is below 70 for at least one word. Read this area on the artwork before deciding whether it differs.' : extraContext ?
          'This match is inside a longer OCR line with unapproved surrounding text. Review the full line for added words or punctuation.' : ambiguous ?
          'More than one OCR area is similarly close to the approved text. Review their locations manually.' : uncertain ?
          'Only a weak text match was found. Compare this area manually; it may be a different line.' :
          'Possible text difference detected by OCR. Compare the highlighted area with the approved text.' });
    }
    findings.sort((a, b) => Number(b.severity === 'critical') - Number(a.severity === 'critical'));
    return result;
  }
  return { analyze };
});
