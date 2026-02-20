# AGENTS

## What this project does
`animated-svgs` is a TanStack Start + React + TypeScript app and CLI toolkit for generating animated SVGs with Gemini, then cleaning and QA-checking them.

It supports:
- A CLI pipeline for one-off runs and batch experiments.
- A local web app for fast generation loops (fixed prompts, custom prompts, and prompt polishing).
- QA utilities for validating structure, required SVG components, animation presence, and safety.

## How it works
Core pipeline flow (`src/lib/pipeline.js`):
1. Read prompt text (or accept `--input-svg` for local-only runs).
2. Generate raw model output with Gemini (`src/lib/gemini.js`) when API mode is used.
3. Preprocess SVG (`src/lib/preprocess.js`).
4. Run QA on preprocessed SVG (`src/lib/qa.js`).
5. Write summary artifacts.

QA checks include XML validity, required SVG components, animation detection, and unsafe pattern checks.

## How to run
Prereqs:
- Node.js 18+
- `npm install`
- `.env` with `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) for generation features

Setup:
```bash
cp .env.example .env
```

Common commands:
```bash
npm run check:key
npm run pipeline -- --prompt "A glowing jellyfish drifting in deep ocean currents."
npm run pipeline -- --input-svg examples/pulse.svg --name local-test
npm run qa -- --input examples/pulse.svg --out-dir qa-output --report qa-output/report.json
npm run iterate -- --config configs/iteration.local.json
npm run dashboard -- --dir runs-lab
npm run view -- --dir runs-lab --port 4173
npm run web
npm run test:e2e
npm run probe:gemini
```

Web app:
- Start with `npm run web`
- Open `http://127.0.0.1:3000`
- `Generate Selected` and `Next Prompt` use the fixed prompt list in `src/lib/web-prompts.js` (default `WEB_PROMPT_MODE=fixed`)
- `Generate Parallel` runs multiple fixed prompts at once
- `Generate Custom` runs with your custom prompt text
- `Polish Prompt` uses Gemini to improve a custom prompt before generation
- `Save Prompt` appends JSONL records to `prompts/saved-prompts.jsonl`
- Generated web SVGs are saved under `results/web-created/` and can be moved to `results/web-archived/` from the UI

## Directory structure
```text
animated-svgs/
  configs/                  Iteration experiment configs
  examples/                 Sample SVG inputs for local testing
  prompts/                  Prompt text files + saved prompt log
  scripts/                  Utility scripts (e.g. Gemini response probing)
  results/                  Web app SVG library (created + archived)
  src/
    cli.js                  Main CLI entrypoint
    check-gemini-key.js     API key detection helper used by npm scripts
    web-server.js           TanStack Start web runtime launcher
    lib/
      pipeline.js           End-to-end run orchestration
      gemini.js             Gemini prompt expansion + SVG generation
      preprocess.js         SVG extraction from model response text
      qa.js                 Structural + animation + safety QA
      iteration.js          Batch experiment runner
      dashboard.js          HTML dashboard generation
      view-server.js        Local viewer for iteration outputs
      env.js                .env loading and API key lookup
      utils.js              Shared parsing and file helpers
      madlib.js             Mad-lib prompt mode helpers
      web-prompts.js        Fixed prompt rotation list for web UI
  public/                   Runtime web assets (scripts + styles)
  test/                     End-to-end test coverage
  runs*/                    Generated pipeline/iteration artifacts
  qa-output*/               QA output folders
```
