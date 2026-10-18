# PrintProof Local

A browser-local second check for the words in print artwork. Compare an English PNG/JPEG flyer with approved copy, then inspect possible digit changes, missing phrases, and OCR uncertainty alongside actual pixel crops.

**This is a prototype review aid, never a print approval.** It does not check bleed, color, font licensing, layout, or all extra unapproved copy. OCR can misread or miss text. Always inspect the original proof.

## Why this exists

A small print shop or independent designer may spot an aesthetic problem quickly while missing a transposed price, changed event date, or phone digit. PrintProof makes a narrow, reviewable comparison before a print run, without sending client artwork to an inference API.

A one-time paid desktop/offline package or a supported print-shop workflow is a possible business model. That is an unvalidated hypothesis: there are no claimed customers, interviews, sales, or measured savings.

## OCR engine

Tesseract.js 5.1.1 runs the Tesseract neural LSTM OCR engine (OEM 1) inside browser WebAssembly. The English open model converts image pixels into recognized words, confidence scores, and bounding boxes. The rest is deterministic comparison and presentation. Without OCR, the application cannot read the artwork.

Recognition uses an existing pretrained model; no model is trained by this application.

## Run locally

This is a static application with no build step and no backend dependency. Serve this directory with any normal static server, for example:

```sh
node server.cjs
```

Open `http://localhost:8766/`. The first check needs network access to download Tesseract.js, its worker/WASM assets, and English weights from jsDelivr. No paid API, token, or account is needed.

The shipped app does **not** claim guaranteed offline reload. The browser may cache assets, but a fully bundled, verified air-gapped distribution is future work.

## Use

1. Try the synthetic four-error flyer or choose a PNG/JPEG.
2. Paste approved copy, one phrase per line. The prototype supports at most 20 approved lines, 1,500 characters total, and 220 characters per line. Larger proofs should be cropped into sections.
3. Run the check. Neural OCR is followed by case/whitespace-aware comparison that preserves meaningful digits and punctuation.
4. Review changed-text crops, missing-text suggestions, and uncertain readings. A missing OCR phrase does not prove it is absent from the image.
5. Save the JSON review report if useful. It contains approved copy and recognized text, so treat it as a client document.

Input limits: PNG/JPEG up to 15 MB and 30 megapixels; the longest edge is reduced to at most 3,000 pixels for recognition. Jobs with more than 200 recognized words or 50 OCR lines are rejected with an explicit message. English text only. Exact phrases can span adjacent OCR lines; approximate matching searches at most three lines. Longer changed phrases may therefore have incomplete evidence.

## Privacy and network behavior

- The application loads public dependency assets from `cdn.jsdelivr.net`.
- Images are opened with a local object URL, decoded, and drawn to an in-memory canvas.
- Tesseract processes the canvas in a browser worker.
- `app.js` has no fetch, XHR, form submission, analytics, account, or inference-server upload path.
- Approved copy and OCR output remain in page memory unless the user saves a report.
- Model weights may be cached by Tesseract in browser storage. Uploaded images are not deliberately saved by the app.
- External CDN requests reveal ordinary network metadata to the CDN. This is browser-local processing, not a claim that no network requests occur.
- There is no persistent project history. Reloading clears artwork and approved-copy changes.

## Validation

Run deterministic comparison tests:

```sh
node matcher.test.cjs
```

In the UI, choose **Run 8-case benchmark**. It uses real neural OCR on synthetic fixtures rather than precomputed text. The fixtures include a clean control, four simultaneous errors, separate price/phone/missing-line/word changes, a case-spacing control, and an unreadable image. Expected labels are used only to evaluate the comparison output, not to generate it.

`benchmark-results.json` records the observed browser run, including raw recognized text, time, model confidence, findings, and missed/unexpected flags. The initial run met all eight case expectations with all eight planted discrepancies flagged and no flags on two clean controls; the unreadable case returned uncertainty. This is a tiny synthetic suite, **not** a production accuracy claim. Timings describe one cloud-browser CPU environment and are not a performance guarantee.

The raw OCR also reads the decorative header bar as `EE` in several examples. The model can invent spurious text; the app exposes its full transcript rather than hiding that limitation.

## Architecture

- `index.html`: accessible, responsive interface; embedded CSS for a single-file shell.
- `app.js`: local file intake, Tesseract worker lifecycle, input caps, cancellation, results, evidence crops, and report download.
- `matcher.js`: deterministic Unicode-aware comparison; punctuation-preserving tokenization; one-to-one phrase matching; focused bounding boxes; uncertainty for low confidence and ambiguous matches.
- `fixtures.js`: reproducible synthetic artwork, clean controls, and deliberate errors.
- `matcher.test.cjs`: focused algorithm tests and regression checks against the actual OCR fixture in `results.json`.
- `benchmark-results.json`: observed end-to-end benchmark evidence.

## Known limitations

A high OCR score is not the probability that text is correct. Exact text may still be misrecognized. Fonts, textured backgrounds, low resolution, rotation, multiple columns, non-English copy, and dense artwork can degrade results. The app checks expected phrases, not completeness of the entire design. Reading order and duplicate phrases can be ambiguous. The final decision belongs to a human.

PDF input, batch projects, a fully packaged offline distribution, and external service integrations are outside this version.

## Open-source credits

- [Tesseract.js](https://github.com/naptha/tesseract.js), Apache-2.0.
- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract), Apache-2.0.
- [Tesseract.js trained data](https://github.com/naptha/tessdata), Apache-2.0. Default English data is the integerized `tessdata_best` LSTM set. The library's default model download URL is not package-version pinned; this distribution does not claim a fully reproducible or integrity-verified dependency bundle.
- [Tesseract.js core](https://github.com/naptha/tesseract.js-core), Apache-2.0.

Original application code is offered under the MIT license. Dependencies retain their own licenses. Synthetic artwork contains fictional event details and a reserved example telephone number.

## Development window

New prototype started October 18, 2026 for the DEV Hacktoberfest Week 2 Side Hustle challenge. Any changes made after the contest deadline must be recorded here.

## Regression update

A separate 19-fixture synthetic OCR check exposed a false positive when correct copy wrapped across four lines. Exact matching now scans adjacent OCR tokens across line breaks, while approximate matching remains bounded to three lines. All 24 deterministic tests pass; replaying the 19 saved OCR outputs meets all 19 fixture expectations. That replay checks the matcher change, not a fresh model run or an independent audit of the change. These selected fixtures do not estimate production accuracy.
