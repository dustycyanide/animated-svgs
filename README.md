# animated-svgs

First-time setup guide for running this project locally.

## Prerequisites

- Node.js 18 or newer
- npm

Check versions:

```bash
node -v
npm -v
```

## 1) Download and install dependencies

```bash
git clone <your-repo-url>
cd animated-svgs
npm install
```

## 2) Create a `.env` file

Create a `.env` file in the project root with:

```bash
GEMINI_API_KEY=your_key_here
```

Notes:

- `GOOGLE_API_KEY` also works if you prefer that name.
- `GEMINI_API_KEY` is the preferred variable.

## 3) Verify your API key is detected

```bash
npm run check:key
```

Expected result: a success message saying the key was found (value stays hidden).

## 4) Optional: install Chromium for render-based QA

Only needed if you want Playwright render/frame-diff checks:

```bash
npx playwright install chromium
```

## 5) Quick smoke check (local, no API call)

```bash
npm run pipeline -- --input-svg examples/pulse.svg --name local-smoke
```

If this succeeds, your local setup is working.
