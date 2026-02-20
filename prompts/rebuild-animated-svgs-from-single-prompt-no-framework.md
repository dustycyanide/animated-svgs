Build a local web application called "animated-svgs".

Optimize for equivalent user-facing capabilities and workflows. Ideally use a modern frontend framework such as tanstack start. Documentation can be found here: https://tanstack.com/llms.txt

Product intent:
Build a toolkit for generating animated SVGs with an LLM, sanitizing outputs, running QA checks, and iterating quickly through a local web workbench.

Primary user journeys:

1. SVG generation: user quickly generates SVGs from fixed prompts or custom prompts, including prompt polishing.
2. SVG Library: user can browse, preview, archive/hide, and delete all previously generated SVGs.
3. Safety + QA visibility: generated outputs are sanitized and checked, with machine-readable QA data available.
4. Crop & Copy: Users can make quick modifications to the SVGs to crop into square, circle, or custom ratio. They can quickly copy SVGs to their clipboard wherever SVGs are shown.
5. Export utility: user can convert an SVG into Discord-friendly animated outputs (emoji/sticker/attachment targets).

Functional requirements:

A) Web-first generation backend

- Accept generation requests from the web app for:
  - fixed prompt generation
  - custom prompt generation
  - prompt polishing
- Require API key from environment variables for model calls.
- must use gemini-3.1-pro-preview for the model! this is the only model that generates good animated SVGs
- Allow model generation tuning controls (for example max output tokens, reasoning/thinking level, polish prompt).
- Save generation artifacts (prompt, raw model response, sanitized SVG, QA report, summary metadata) in timestamped output folders.

B) SVG preprocessing/safety

- Extract a single SVG document from mixed model output text.
- Remove unsafe/scriptable content at minimum:
  - script tags
  - inline event handlers
  - javascript: URLs
  - foreignObject payloads
- Preserve useful animation markup where safe.

C) QA engine

- Validate that output is parseable XML/SVG.
- Check required structure:
  - svg root exists
  - dimensions are resolvable (viewBox or width+height equivalent)
  - animation is present (SMIL and/or CSS animation detection)
- Detect unsafe patterns and emit clear findings.
- Return machine-readable report and high-level pass/fail summary.

D) Prompt systems

- Support fixed prompt rotation list for fast generation loops.
- Support optional mad-lib style prompt seed expansion workflow.
- Support prompt polishing:
  - user enters rough prompt
  - model rewrites to a stronger prompt
  - custom polish template supported
  - placeholders equivalent to examples + user prompt are robustly handled

E) Web application UX

- Local web server with two main UI surfaces:
  - generation workbench
  - saved library/gallery view
- Workbench capabilities:
  - generate selected fixed prompt
  - move between fixed prompts
  - generate multiple prompts in parallel
  - custom prompt entry and generate
  - polish prompt before generate
  - advanced generation controls
  - save prompt action to append-only log
- Viewer/library capabilities:
  - preview SVGs
  - display metadata (prompt, model, timestamp, settings)
  - archive/hide and unarchive/restore items
  - copy SVG markup
  - Discord export action with selectable preset target
- Design Principles
  - Follow design principles from the following books:
    - Refactoring UI
    - Don't Make Me Think
    - Design of Every Day Things
    - Non-Designer's Design Book
- Dark Mode should be the default. should have a theme toggle.
- Library is the home page. "+ Generate" button should take you to the workbench to generate a new image.
- Each SVG in the library should be openable - taking you to an SVG viewer page with SVG related functionality such as copy / download / crop / etc.

F) Library persistence/seeding

- Maintain created vs archived scopes (or equivalent).
- On first launch, seed library from bundled example SVGs.
- Seeding must happen once only, with a persistent marker so restarts do not reseed.
- If library is emptied after marker exists, do not auto-reseed.

G) Discord export feature

- Offer multiple presets equivalent to:
  - regular attachment
  - emoji (webp)
  - emoji (gif)
  - sticker
- Enforce size/format constraints by preset.
- Produce data consumable by the web UI (for example base64 payload plus metadata).
- Include dimension parsing and fallback logic for SVG inputs.

H) Web routes and API surface

- Provide routes for:
  - main library/gallery
  - generation workbench
- Provide JSON endpoints for:
  - prompt selection/listing
  - generation
  - prompt polishing
  - library list/item retrieval
  - archive/hide and unarchive/restore
  - discord export presets and export action
- Return clear, consistent error payloads for UI handling.

I) Documentation

- README must cover:
  - what the tool does
  - setup/prereqs
  - web app usage flows
  - environment variables and API key setup
  - where artifacts are written
- AGENTS.md (or equivalent contributor guide) must describe architecture and operator workflows.

J) Testing

- Include automated tests for critical behavior:
  - sanitizer removals of unsafe SVG patterns
  - prompt polish placeholder handling
  - export preset and dimension parsing behavior
  - one-time seed behavior across server restarts
  - integration checks for core web API routes

Important Details:

- must use gemini-3.1-pro-preview for the model
- use this for the prompt:

```
You are an expert SVG motion designer.
Return exactly one complete SVG document and nothing else.
Your first non-whitespace characters must be <svg and your response must end with </svg>.
Output must be valid XML with a single <svg> root.
Include animation using SMIL tags (<animate>, <animateTransform>, <animateMotion>, or <set>) and/or CSS keyframes.
Do not use JavaScript, <script>, external assets, raster images, markdown fences, JSON, or explanatory text.

Create a high-quality animated SVG scene from this prompt:
{{user_prompt}}
```

- must use these for the starter example prompts:

```
1) Generate an SVG of a 3D isometric cardboard box that drops, folds its flaps, seals with tape, and turns into a confirmation checkmark. Crisp vector illustration with warm orange and neutral grey tones

2) Generate an SVG of a chameleon sitting quietly on a branch. Make the chameleon's eyes follow the user's cursor as it moves across the screen

3) Generate an SVG animation of two minimal isometric smartphones where a gold coin flips out of one screen and travels along a dashed path into a digital wallet on the second screen. Flat UI style with pastel blue and green tones

4) Generate an SVG of a sliding toggle switch where hovering over the sun icon turns it into a glowing moon, smoothly fading the background from light to dark. Clean flat UI style

5) Generate a 4:3 SVG of an organic, minimalist illustration of a small sprout in a pot, where the stem smoothly grows taller and leaves scale up sequentially on hover. Earthy green and terracotta flat vectors on a beige background
```

- polish system prompt:

```
You are an expert prompt editor for animated SVG generation. Rewrite user ideas into a concise, vivid, production-ready SVG prompt. Preserve the user's core intent while improving clarity, motion detail, and style consistency. Default to high-level creative direction instead of specific colors, exact visual themes, or tightly constrained styling details. Only include detailed color, palette, theme, or style constraints when the user explicitly asks for them. Return plain text only with no markdown, no bullets, no labels, and no surrounding quotes.

```

- Polish user prompt:

```
Rewrite the following user idea into one polished prompt for animated SVG generation.
Match the tone and structure of the style examples while keeping the same concept.
Keep the rewritten prompt imaginative and open-ended by default: preserve the core subject and key motion/theme, but avoid specifying colors or exact theme/style details unless the user explicitly requests that level of detail.

Style examples:
{{examples}}

User idea:
{{userPrompt}}

Return only the rewritten prompt.
```

Execution protocol (required):

0. Setup Tanstack Start

1. Early scaffolding and folder READMEs

- In the first implementation phase, scaffold the high-level project folders early.

Validation before finish

- Install dependencies.
- Run the test suite and essential web smoke checks.
- If anything cannot run, report exact blockers and remaining work.

Final user handoff (required)

- End with a short "Run these commands now" section.
- Include exact commands based on your implementation, covering at minimum:
  - dependency install
  - environment setup
  - API key validation check
  - web app launch
  - tests
- The handoff must explicitly instruct:
  - create `.env` from `.env.example` (or equivalent)
  - add Gemini API key in `.env` using `GEMINI_API_KEY` (preferred) or `GOOGLE_API_KEY`

Definition of done:

- The web application is functionally complete for the flows above.
- Tests pass (or failures are explicitly explained with root cause).
- Documentation is accurate.
- Temporary AGENTS setup section has been removed.

Now implement with pragmatic engineering choices.
