You are a senior software engineer and autonomous coding agent. Build a local developer tool called "animated-svgs".

Important implementation freedom:
- Do NOT treat this as a source-code copier task.
- You may choose file names, internal architecture, frameworks, package versions, and module layout.
- Optimize for equivalent user-facing capabilities and workflows.
- Keep the system maintainable, testable, and documented.

Product intent:
Build a toolkit for generating animated SVGs with an LLM, sanitizing outputs, running QA checks, and iterating quickly through a local web workbench.

Primary user journeys:
1) Command-line run: user provides prompt text (or local SVG), gets a saved run folder with artifacts and QA summary.
2) Command-line QA-only: user passes an SVG file, gets a pass/fail report with issues.
3) Batch experiments: user runs many prompt/config variants and can inspect a generated dashboard.
4) Local web workbench: user rapidly generates SVGs from fixed prompts or custom prompts, with prompt polishing and saved output library.
5) Library curation: user can view, archive/hide, and restore generated SVGs.
6) Export utility: user can convert an SVG into Discord-friendly animated outputs (emoji/sticker/attachment targets).

Functional requirements:

A) Generation pipeline
- Accept prompt text or prompt file input.
- Support local-only mode where user provides an existing SVG and skips model generation.
- For model mode:
  - require an API key from environment variables.
  - allow model override and generation tuning controls.
- Save run artifacts (prompt, raw model response, sanitized SVG, QA report, summary metadata) into timestamped run folders.

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
- Return machine-readable report + high-level pass/fail summary.

D) Prompt systems
- Support fixed prompt rotation list for fast generation loops.
- Support optional "mad-lib" style prompt seed expansion workflow.
- Support "prompt polish" flow:
  - user enters rough prompt
  - model rewrites into stronger generation prompt
  - custom polish template allowed
  - placeholders equivalent to examples + user prompt are supported and robustly handled

E) Web application UX
- Local server with two main UI surfaces:
  - generation workbench
  - saved library/gallery view
- Workbench capabilities:
  - generate selected fixed prompt
  - move between fixed prompts
  - generate in parallel for multiple fixed prompts
  - custom prompt entry + generate
  - polish prompt before generate
  - advanced generation controls (model, max tokens, reasoning/thinking level)
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
- Seeding must happen once only, with a persistent marker so restarts do not re-seed.
- If library is emptied after marker exists, do not auto-reseed.

G) Discord export feature
- Offer multiple presets equivalent to:
  - regular attachment
  - emoji (webp)
  - emoji (gif)
  - sticker
- Enforce size/format constraints by preset.
- Produce data consumable by the web UI (e.g., base64 payload + metadata).
- Include dimension parsing/fallback logic for SVG inputs.

H) Iteration + dashboard + viewer server
- Batch runner reads experiment configuration and executes selected experiments.
- Support filtering experiments and a watch/re-run workflow.
- Emit an iteration report.
- Generate a browsable dashboard that lists runs, QA outcomes, and links to artifacts.
- Provide a local viewer server for the dashboard and run files.

I) CLI surface
- Provide clear commands for:
  - generate/run pipeline
  - qa-only
  - iteration
  - dashboard generation
  - local viewer server
  - API key check
- CLI output must be user-readable and include run locations and QA result summaries.

J) Documentation
- README must cover:
  - what the tool does
  - setup/prereqs
  - how to run CLI flows
  - how to use web flows
  - where artifacts are written
- AGENTS.md (or equivalent contributor guide) must describe architecture and operator workflows.

K) Testing
- Include automated tests for critical behavior:
  - end-to-end local-input pipeline artifact creation
  - sanitizer removals of unsafe SVG patterns
  - prompt polish template placeholder handling
  - export preset and dimension parsing behavior
  - one-time seed behavior across server restarts

Execution protocol (required):

1) Temporary setup-tracking section
- Add a temporary section in AGENTS.md named exactly:
  - `## Agent Setup Progress (Temporary)`
- Track:
  - phase order
  - current phase
  - completed phases
  - pending phases
  - `Next action for user: ...`
- Update this section at each phase boundary.

2) Phase files for large work
- If implementation cannot be finished cleanly in one pass, create phase docs under `plans/` (or similar).
- Each phase doc must include:
  - objective
  - implementation tasks
  - validation commands
  - exit criteria
  - final line: `Next action for user: ...`

3) Self-cleanup
- After full completion and validations:
  - remove `## Agent Setup Progress (Temporary)` entirely from AGENTS.md.
  - leave only stable, long-term project documentation.

4) Validation before finish
- Install dependencies.
- Run test suite and any essential smoke checks.
- If anything cannot run, report exact blocker and remaining work.

5) Final user handoff (required)
- End with a short "Run these commands now" section for the user.
- Include exact commands based on what you implemented, covering at minimum:
  - dependency install
  - environment setup
  - API key validation
  - one pipeline run
  - one QA run
  - web app launch
  - tests
- The handoff must explicitly instruct:
  - create `.env` from `.env.example` (or equivalent)
  - add Gemini API key to `.env` using `GEMINI_API_KEY` (preferred) or `GOOGLE_API_KEY`

Definition of done:
- The application is functionally complete for the flows above.
- Tests pass (or failures are explicitly explained with root cause).
- Documentation is accurate.
- Temporary AGENTS setup section has been removed.

Now implement with pragmatic engineering choices.
