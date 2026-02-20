# AGENTS

## What this project does
`animated-svgs` is a local Node.js toolkit for generating animated SVGs with Gemini, then cleaning and QA-checking them.

It supports:
- A CLI pipeline for one-off runs and batch experiments.
- A tiny local web app with a `Next` button to generate examples quickly.
- QA utilities for validating structure, animation presence, and motion.

## How it works
Core pipeline flow (`src/lib/pipeline.js`):
1. Read prompt text (or accept `--input-svg` for local-only runs).
2. Generate raw model output with Gemini (`src/lib/gemini.js`) when API mode is used.
3. Preprocess SVG (`src/lib/preprocess.js`).
4. Run QA on preprocessed SVG (`src/lib/qa.js`).
5. Optimize/postprocess SVG (`src/lib/postprocess.js`).
6. Run QA again and write summary artifacts.

QA checks include XML validity, animation detection, unsafe pattern checks, and optional Playwright frame-diff motion checks.

## How to run
Prereqs:
- Node.js 18+
- `npm install`
- `.env` with `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) for generation features

Common commands:
```bash
npm run check:key
npm run pipeline -- --prompt "A glowing jellyfish drifting in deep ocean currents."
npm run pipeline -- --input-svg examples/pulse.svg --name local-test
npm run qa -- --input examples/pulse.svg --out-dir qa-output --report qa-output/report.json
npm run iterate -- --config configs/iteration.local.json
npm run view -- --dir runs-lab --port 4173
npm run web
npm run test:e2e
```

Web app:
- Start with `npm run web`
- Open `http://127.0.0.1:3000`
- `Next` generates from the fixed prompt list in `src/lib/web-prompts.js`
- `Save Prompt` appends JSONL records to `prompts/saved-prompts.jsonl`

## Directory structure
```text
animated-svgs/
  configs/                  Iteration experiment configs
  examples/                 Sample SVG inputs for local testing
  prompts/                  Prompt text files + saved prompt log
  scripts/                  Utility scripts (e.g. Gemini response probing)
  src/
    cli.js                  Main CLI entrypoint
    web-server.js           Local web server for quick generation UI
    lib/
      pipeline.js           End-to-end run orchestration
      gemini.js             Gemini prompt expansion + SVG generation
      preprocess.js         SVG cleanup/normalization before QA
      postprocess.js        Optimization pass after preprocessing
      qa.js                 Structural + animation + optional render QA
      iteration.js          Batch experiment runner
      dashboard.js          HTML dashboard generation
      view-server.js        Local viewer for iteration outputs
      env.js                .env loading and API key lookup
      utils.js              Shared parsing and file helpers
      madlib.js             Mad-lib prompt mode helpers
      web-prompts.js        Fixed prompt rotation list for web UI
  web/                      Static frontend (index.html, app.js, styles.css)
  test/                     End-to-end test coverage
  runs*/                    Generated pipeline/iteration artifacts
  qa-output*/               QA output folders
```
