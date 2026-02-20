Build a local web application called "animated-svgs".

Optimize for equivalent user-facing capabilities and workflows, but you have freedom to choose architecture, libraries, file names, and implementation details. The important thing is that it works and is maintainable.

Product intent:
Build a toolkit for generating animated SVGs with an LLM, sanitizing outputs, running QA checks, and iterating quickly through a local web workbench.

Primary user journeys:

1. Web workbench generation: user quickly generates SVGs from fixed prompts or custom prompts, including prompt polishing.
2. Library curation: user can browse, preview, archive/hide, and restore generated SVGs.
3. Safety + QA visibility: generated outputs are sanitized and checked, with machine-readable QA data available.
4. Export utility: user can convert an SVG into Discord-friendly animated outputs (emoji/sticker/attachment targets).

Functional requirements:

A) Web-first generation backend

- Accept generation requests from the web app for:
  - fixed prompt generation
  - custom prompt generation
  - prompt polishing
- Require API key from environment variables for model calls.
- Allow model override and generation tuning controls (for example max output tokens and reasoning/thinking level).
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

Execution protocol (required):

0. Early scaffolding and folder READMEs

- In the first implementation phase, scaffold the high-level project folders early.
- For each major folder, create a local README.md that explains:
  - what belongs there
  - expected modules/files
  - key responsibilities and boundaries
- Keep those folder READMEs aligned as implementation evolves.

1. Temporary setup-tracking section

- Add a temporary section in AGENTS.md named exactly:
  - `## Agent Setup Progress (Temporary)`
- Track:
  - phase order
  - current phase
  - completed phases
  - pending phases
  - `Next action for user: ...`
- Update this section at each phase boundary.

2. Phase files for large work

- If implementation cannot be finished cleanly in one pass, create phase docs under `plans/` (or similar).
- Each phase doc must include:
  - objective
  - implementation tasks
  - validation commands
  - exit criteria
  - final line: `Next action for user: ...`

3. Self-cleanup

- After full completion and validations:
  - remove `## Agent Setup Progress (Temporary)` entirely from AGENTS.md.
  - leave only stable, long-term project documentation.

4. Validation before finish

- Install dependencies.
- Run the test suite and essential web smoke checks.
- If anything cannot run, report exact blockers and remaining work.

5. Final user handoff (required)

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
