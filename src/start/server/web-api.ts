import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const {
  loadEnv,
  findGeminiKey,
  resolveGeminiModel,
  DEFAULT_GEMINI_MODEL,
} = require("../../lib/env.js") as any;
const { ensureDir, parseNumber, slugify, timestampId } = require("../../lib/utils.js") as any;
const { buildMadlibSeed, buildMadlibText } = require("../../lib/madlib.js") as any;
const { FIXED_WEB_PROMPTS, getNextFixedPrompt, listFixedPrompts } = require("../../lib/web-prompts.js") as any;
const {
  DEFAULT_PROMPT_POLISH_TEMPLATE,
  expandMadlibPrompt,
  generateAnimatedSvg,
  polishSvgPrompt,
} = require("../../lib/gemini.js") as any;
const { preprocessSvg } = require("../../lib/preprocess.js") as any;
const {
  DISCORD_EXPORT_CONFIG_PRESET_LIST,
  DISCORD_EXPORT_PRESET_LIST,
  DiscordExportError,
  exportDiscordAsset,
} = require("../../lib/discord-export.js") as any;

type JsonRecord = Record<string, unknown>;
type NodeError = Error & { code?: string; statusCode?: number };

const APP_CWD = path.resolve(process.env.ANIMATED_SVGS_WORKDIR || process.cwd());
const WEB_PROMPT_MODE = String(process.env.WEB_PROMPT_MODE || "fixed").toLowerCase();
const SAVED_PROMPTS_FILE = path.resolve(APP_CWD, "prompts", "saved-prompts.jsonl");
const LIBRARY_ROOT = path.resolve(APP_CWD, "results");
const CREATED_SVGS_DIR = path.resolve(LIBRARY_ROOT, "web-created");
const ARCHIVED_SVGS_DIR = path.resolve(LIBRARY_ROOT, "web-archived");
const EXAMPLES_DIR = path.resolve(APP_CWD, "examples");
const LIBRARY_SEED_MARKER = path.resolve(LIBRARY_ROOT, ".web-library-seeded.json");
const ALLOWED_THINKING_LEVELS = new Set(["off", "low", "medium", "high"]);

let runtimeReadyPromise: Promise<void> | null = null;

function jsonResponse(status: number, payload: JsonRecord): Response {
  return new Response(`${JSON.stringify(payload)}\n`, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function textResponse(status: number, text: string, contentType = "text/plain; charset=utf-8"): Response {
  return new Response(text, {
    status,
    headers: {
      "Content-Type": contentType,
    },
  });
}

function safeAssetName(inputName: unknown): string {
  const name = String(inputName || "").trim();
  if (!name) {
    throw new Error("Missing SVG name.");
  }
  if (path.basename(name) !== name || !name.toLowerCase().endsWith(".svg")) {
    throw new Error("Invalid SVG name.");
  }
  return name;
}

function metadataPathFor(directory: string, svgName: string): string {
  const baseName = svgName.slice(0, -4);
  return path.join(directory, `${baseName}.json`);
}

async function readJsonIfPresent(targetPath: string): Promise<JsonRecord | null> {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    return JSON.parse(raw) as JsonRecord;
  } catch {
    return null;
  }
}

async function resolveUniqueName(directory: string, fileName: string): Promise<string> {
  const extension = path.extname(fileName);
  const stem = path.basename(fileName, extension);
  let attempt = 0;

  while (attempt < 1000) {
    const candidate = attempt === 0 ? `${stem}${extension}` : `${stem}-${attempt + 1}${extension}`;
    const candidatePath = path.join(directory, candidate);
    try {
      await fs.access(candidatePath);
      attempt += 1;
    } catch {
      return candidate;
    }
  }

  throw new Error("Unable to resolve unique filename.");
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function countSvgFiles(directory: string): Promise<number> {
  await ensureDir(directory);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries.filter((entry: { isFile: () => boolean; name: string }) => entry.isFile() && entry.name.toLowerCase().endsWith(".svg")).length;
}

function titleFromFileName(fileName: string): string {
  const stem = path.basename(fileName, ".svg");
  const words = stem.split(/[-_]+/).filter(Boolean);
  if (!words.length) {
    return "Starter SVG Example";
  }
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

async function seedStarterLibraryIfNeeded(): Promise<void> {
  await ensureDir(LIBRARY_ROOT);
  await ensureDir(CREATED_SVGS_DIR);
  await ensureDir(ARCHIVED_SVGS_DIR);

  if (await fileExists(LIBRARY_SEED_MARKER)) {
    return;
  }

  const [createdCount, archivedCount] = await Promise.all([
    countSvgFiles(CREATED_SVGS_DIR),
    countSvgFiles(ARCHIVED_SVGS_DIR),
  ]);

  if (createdCount > 0 || archivedCount > 0) {
    const marker = {
      seededAt: new Date().toISOString(),
      seededCount: 0,
      skipped: true,
      reason: "library-not-empty",
      createdCount,
      archivedCount,
    };
    await fs.writeFile(LIBRARY_SEED_MARKER, `${JSON.stringify(marker, null, 2)}\n`);
    return;
  }

  let exampleEntries: Array<{ isFile: () => boolean; name: string }> = [];
  try {
    exampleEntries = await fs.readdir(EXAMPLES_DIR, { withFileTypes: true });
  } catch {
    exampleEntries = [];
  }

  const sourceFiles = exampleEntries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".svg"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  let seededCount = 0;
  const seededFiles: string[] = [];

  for (const sourceName of sourceFiles) {
    const sourcePath = path.join(EXAMPLES_DIR, sourceName);
    const sourceStem = path.basename(sourceName, ".svg");
    const targetName = await resolveUniqueName(
      CREATED_SVGS_DIR,
      `example-${slugify(sourceStem) || "sample"}.svg`,
    );
    const targetSvgPath = path.join(CREATED_SVGS_DIR, targetName);
    const createdAt = new Date().toISOString();
    const meta = {
      name: targetName,
      createdAt,
      prompt: `${titleFromFileName(sourceName)} starter example`,
      category: "starter-example",
      seed: null,
      promptIndex: null,
      promptCount: null,
      promptMode: "starter-example",
      model: "local-example",
      generationConfig: null,
    };

    await fs.copyFile(sourcePath, targetSvgPath);
    await fs.writeFile(
      metadataPathFor(CREATED_SVGS_DIR, targetName),
      `${JSON.stringify(meta, null, 2)}\n`,
    );

    seededCount += 1;
    seededFiles.push(targetName);
  }

  const marker = {
    seededAt: new Date().toISOString(),
    seededCount,
    seededFiles,
    sourceDir: EXAMPLES_DIR,
  };
  await fs.writeFile(LIBRARY_SEED_MARKER, `${JSON.stringify(marker, null, 2)}\n`);
}

async function ensureRuntimeReady(): Promise<void> {
  if (runtimeReadyPromise) {
    return runtimeReadyPromise;
  }

  runtimeReadyPromise = (async () => {
    if (!process.env.ENV_FILE) {
      process.env.ENV_FILE = path.resolve(APP_CWD, ".env");
    }

    loadEnv();
    await ensureDir(CREATED_SVGS_DIR);
    await ensureDir(ARCHIVED_SVGS_DIR);
    await seedStarterLibraryIfNeeded();
  })();

  return runtimeReadyPromise;
}

async function saveGeneratedSvg({
  svg,
  prompt,
  category,
  seed,
  promptIndex,
  promptCount,
  promptMode,
  model,
  generationConfig = null,
}: {
  svg: string;
  prompt: string;
  category: string | null;
  seed: JsonRecord | null;
  promptIndex: number | null;
  promptCount: number | null;
  promptMode: string;
  model: string;
  generationConfig?: JsonRecord | null;
}): Promise<JsonRecord> {
  await ensureDir(CREATED_SVGS_DIR);
  const stamp = timestampId();
  const promptSlug = slugify(prompt || "svg");
  const fileName = await resolveUniqueName(CREATED_SVGS_DIR, `${stamp}-${promptSlug || "svg"}.svg`);
  const createdAt = new Date().toISOString();
  const svgPath = path.join(CREATED_SVGS_DIR, fileName);
  const meta = {
    name: fileName,
    createdAt,
    prompt: typeof prompt === "string" ? prompt : null,
    category: typeof category === "string" ? category : null,
    seed: seed && typeof seed === "object" ? seed : null,
    promptIndex: Number.isInteger(promptIndex) ? promptIndex : null,
    promptCount: Number.isInteger(promptCount) ? promptCount : null,
    promptMode: typeof promptMode === "string" ? promptMode : null,
    model: typeof model === "string" ? model : null,
    generationConfig:
      generationConfig && typeof generationConfig === "object" ? generationConfig : null,
  };

  await fs.writeFile(svgPath, svg, "utf8");
  await fs.writeFile(metadataPathFor(CREATED_SVGS_DIR, fileName), `${JSON.stringify(meta, null, 2)}\n`);

  return {
    ...meta,
    scope: "created",
  };
}

async function listLibraryItems(scope = "created"): Promise<JsonRecord> {
  const activeScope = scope === "archived" ? "archived" : "created";
  const directory = activeScope === "archived" ? ARCHIVED_SVGS_DIR : CREATED_SVGS_DIR;

  await ensureDir(directory);
  await ensureDir(CREATED_SVGS_DIR);
  await ensureDir(ARCHIVED_SVGS_DIR);

  const entries = await fs.readdir(directory, { withFileTypes: true });
  const svgEntries = entries
    .filter((entry: { isFile: () => boolean; name: string }) => entry.isFile() && entry.name.toLowerCase().endsWith(".svg"))
    .map((entry) => entry.name);

  const items = await Promise.all(
    svgEntries.map(async (name) => {
      const svgPath = path.join(directory, name);
      const stat = await fs.stat(svgPath);
      const meta = await readJsonIfPresent(metadataPathFor(directory, name));
      return {
        name,
        scope: activeScope,
        createdAt:
          (meta && typeof meta.createdAt === "string" && meta.createdAt) ||
          stat.birthtime.toISOString(),
        prompt: meta && typeof meta.prompt === "string" ? meta.prompt : null,
        category: meta && typeof meta.category === "string" ? meta.category : null,
        promptMode: meta && typeof meta.promptMode === "string" ? meta.promptMode : null,
        model: meta && typeof meta.model === "string" ? meta.model : null,
        generationConfig:
          meta && meta.generationConfig && typeof meta.generationConfig === "object"
            ? meta.generationConfig
            : null,
        updatedAt: stat.mtime.toISOString(),
      };
    }),
  );

  items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  let archivedCount = 0;
  if (activeScope === "created") {
    const archivedEntries = await fs.readdir(ARCHIVED_SVGS_DIR, { withFileTypes: true });
    archivedCount = archivedEntries.filter(
      (entry: { isFile: () => boolean; name: string }) => entry.isFile() && entry.name.toLowerCase().endsWith(".svg"),
    ).length;
  }

  return {
    scope: activeScope,
    items,
    archivedCount,
  };
}

async function readLibrarySvg({ scope = "created", name }: { scope?: string; name: unknown }): Promise<JsonRecord> {
  const activeScope = scope === "archived" ? "archived" : "created";
  const fileName = safeAssetName(name);
  const directory = activeScope === "archived" ? ARCHIVED_SVGS_DIR : CREATED_SVGS_DIR;
  const svgPath = path.join(directory, fileName);
  const svg = await fs.readFile(svgPath, "utf8");
  const stat = await fs.stat(svgPath);
  const meta = await readJsonIfPresent(metadataPathFor(directory, fileName));

  return {
    name: fileName,
    scope: activeScope,
    svg,
    meta: {
      createdAt:
        (meta && typeof meta.createdAt === "string" && meta.createdAt) ||
        stat.birthtime.toISOString(),
      prompt: meta && typeof meta.prompt === "string" ? meta.prompt : null,
      category: meta && typeof meta.category === "string" ? meta.category : null,
      promptMode: meta && typeof meta.promptMode === "string" ? meta.promptMode : null,
      model: meta && typeof meta.model === "string" ? meta.model : null,
      generationConfig:
        meta && meta.generationConfig && typeof meta.generationConfig === "object"
          ? meta.generationConfig
          : null,
    },
  };
}

async function moveLibrarySvg({
  name,
  fromScope,
  toScope,
}: {
  name: unknown;
  fromScope: "created" | "archived";
  toScope: "created" | "archived";
}): Promise<JsonRecord> {
  const fileName = safeAssetName(name);
  const fromDir = fromScope === "archived" ? ARCHIVED_SVGS_DIR : CREATED_SVGS_DIR;
  const toDir = toScope === "archived" ? ARCHIVED_SVGS_DIR : CREATED_SVGS_DIR;

  await ensureDir(fromDir);
  await ensureDir(toDir);

  const sourceSvgPath = path.join(fromDir, fileName);
  const sourceMetaPath = metadataPathFor(fromDir, fileName);
  const targetName = await resolveUniqueName(toDir, fileName);
  const targetSvgPath = path.join(toDir, targetName);
  const targetMetaPath = metadataPathFor(toDir, targetName);

  await fs.rename(sourceSvgPath, targetSvgPath);

  try {
    await fs.rename(sourceMetaPath, targetMetaPath);
  } catch (error) {
    const typedError = error as NodeError;
    if (typedError.code !== "ENOENT") {
      throw error;
    }
  }

  return { name: targetName, scope: toScope };
}

async function deleteLibrarySvg({ name, scope }: { name: unknown; scope: string }): Promise<JsonRecord> {
  const activeScope = scope === "archived" ? "archived" : "created";
  const fileName = safeAssetName(name);
  const directory = activeScope === "archived" ? ARCHIVED_SVGS_DIR : CREATED_SVGS_DIR;

  await ensureDir(directory);
  const svgPath = path.join(directory, fileName);
  const metaPath = metadataPathFor(directory, fileName);

  await fs.unlink(svgPath);
  try {
    await fs.unlink(metaPath);
  } catch (error) {
    const typedError = error as NodeError;
    if (typedError.code !== "ENOENT") {
      throw error;
    }
  }

  return { name: fileName, scope: activeScope };
}

async function parseJsonBody(request: Request): Promise<JsonRecord> {
  const raw = (await request.text()).trim();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as JsonRecord;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function readModelFromBody(body: JsonRecord): string | null {
  if (typeof body?.model === "string" && body.model.trim().length > 0) {
    return body.model.trim();
  }
  return null;
}

function resolveWebPolishModel(requestedModel: unknown): string {
  const fromBody = readModelFromBody({ model: requestedModel });
  if (fromBody) {
    return fromBody;
  }
  if (typeof process.env.WEB_POLISH_MODEL === "string" && process.env.WEB_POLISH_MODEL.trim().length > 0) {
    return process.env.WEB_POLISH_MODEL.trim();
  }
  return DEFAULT_GEMINI_MODEL;
}

function readPositiveInteger(input: unknown): number | null {
  if (input === null || input === undefined || input === "") {
    return null;
  }
  const value = Number.parseInt(String(input), 10);
  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function normalizeThinkingLevel(input: unknown): string {
  const value = String(input || "low").toLowerCase();
  if (!ALLOWED_THINKING_LEVELS.has(value)) {
    return "low";
  }
  return value;
}

function readGenerationConfigFromBody(body: JsonRecord): { maxOutputTokens: number | null; thinkingLevel: string } {
  const maxOutputTokens = readPositiveInteger(body?.maxOutputTokens);
  const thinkingLevel = normalizeThinkingLevel(body?.thinkingLevel);
  return {
    maxOutputTokens,
    thinkingLevel,
  };
}

function readPolishPromptTemplateFromBody(body: JsonRecord): string | null {
  if (typeof body?.polishPromptTemplate !== "string") {
    return null;
  }
  const template = body.polishPromptTemplate.trim();
  if (!template) {
    return null;
  }
  return template;
}

async function generateFromPrompt({
  apiKey,
  model,
  prompt,
  category = null,
  seed = null,
  promptIndex = null,
  promptCount = null,
  promptMode = "custom",
  generationConfig = null,
}: {
  apiKey: string;
  model: string;
  prompt: string;
  category?: string | null;
  seed?: JsonRecord | null;
  promptIndex?: number | null;
  promptCount?: number | null;
  promptMode?: string;
  generationConfig?: JsonRecord | null;
}): Promise<Response> {
  const maxOutputTokens = readPositiveInteger(generationConfig?.maxOutputTokens);
  const thinkingLevel = normalizeThinkingLevel(generationConfig?.thinkingLevel);
  const generation = await generateAnimatedSvg({
    apiKey,
    model,
    prompt,
    temperature: 1,
    maxOutputTokens,
    thinkingLevel,
  });
  const rawModelResponse = generation.text;

  let preprocessed;
  try {
    preprocessed = preprocessSvg(rawModelResponse);
  } catch (error) {
    return jsonResponse(422, {
      error: (error as Error).message,
      prompt,
      category,
      seed,
      promptIndex,
      promptCount,
      promptMode,
      model: generation.modelVersion,
      finishReason: generation.finishReason,
      usageMetadata: generation.usageMetadata,
      generationConfig: {
        maxOutputTokens,
        thinkingLevel,
      },
      rawModelResponse,
    });
  }

  const savedAsset = await saveGeneratedSvg({
    svg: preprocessed.svg,
    prompt,
    category,
    seed,
    promptIndex,
    promptCount,
    promptMode,
    model: generation.modelVersion,
    generationConfig: {
      maxOutputTokens,
      thinkingLevel,
    },
  });

  return jsonResponse(200, {
    prompt,
    category,
    seed,
    promptIndex,
    promptCount,
    promptMode,
    svg: preprocessed.svg,
    model: generation.modelVersion,
    finishReason: generation.finishReason,
    usageMetadata: generation.usageMetadata,
    generationConfig: {
      maxOutputTokens,
      thinkingLevel,
    },
    rawModelResponse,
    savedAsset,
  });
}

function readPromptFromBody(body: JsonRecord): string {
  return typeof body.prompt === "string" ? body.prompt.trim() : "";
}

function readSvgFromBody(body: JsonRecord): string {
  return typeof body.svg === "string" ? body.svg : "";
}

async function resolveNextPromptSelection({
  model,
  apiKey,
}: {
  model: string;
  apiKey: string | null;
}): Promise<{
  prompt: string;
  category: string | null;
  seed: JsonRecord | null;
  promptIndex: number | null;
  promptCount: number | null;
  promptMode: string;
  needsApiKey: boolean;
}> {
  let prompt = "";
  let category: string | null = null;
  let seed: JsonRecord | null = null;
  let promptIndex: number | null = null;
  let promptCount: number | null = null;
  let needsApiKey = false;

  if (WEB_PROMPT_MODE === "madlib") {
    seed = buildMadlibSeed();
    category = typeof seed?.category === "string" ? seed.category : null;

    if (!apiKey) {
      needsApiKey = true;
    } else {
      const madlibText = buildMadlibText(seed);
      const expanded = await expandMadlibPrompt({
        apiKey,
        model,
        madlibText,
      });
      prompt = expanded.prompt;
    }
  } else {
    const next = getNextFixedPrompt();
    prompt = next.prompt;
    promptIndex = next.promptIndex;
    promptCount = next.promptCount;
    category = "fixed-prompts";
  }

  return {
    prompt,
    category,
    seed,
    promptIndex,
    promptCount,
    promptMode: WEB_PROMPT_MODE,
    needsApiKey,
  };
}

function toPromptSelectionPayload(selection: {
  prompt: string;
  category: string | null;
  seed: JsonRecord | null;
  promptIndex: number | null;
  promptCount: number | null;
  promptMode: string;
}): JsonRecord {
  return {
    prompt: selection.prompt,
    category: selection.category,
    seed: selection.seed,
    promptIndex: selection.promptIndex,
    promptCount: selection.promptCount,
    promptMode: selection.promptMode,
  };
}

async function handleNextPrompt(request: Request): Promise<Response> {
  const body = await parseJsonBody(request);
  const model = resolveGeminiModel(readModelFromBody(body));
  const key = findGeminiKey();
  const selection = await resolveNextPromptSelection({
    model,
    apiKey: key ? key.value : null,
  });
  const payload = toPromptSelectionPayload(selection);

  if (selection.needsApiKey) {
    return jsonResponse(400, {
      error:
        "Gemini API key missing. Set GEMINI_API_KEY or GOOGLE_API_KEY in .env before using Next.",
      ...payload,
    });
  }

  return jsonResponse(200, payload);
}

async function handleNext(request: Request): Promise<Response> {
  const body = await parseJsonBody(request);
  const model = resolveGeminiModel(readModelFromBody(body));
  const generationConfig = readGenerationConfigFromBody(body);
  const key = findGeminiKey();
  const selection = await resolveNextPromptSelection({
    model,
    apiKey: key ? key.value : null,
  });
  const payload = toPromptSelectionPayload(selection);

  if (!key) {
    return jsonResponse(400, {
      error:
        "Gemini API key missing. Set GEMINI_API_KEY or GOOGLE_API_KEY in .env before using Next.",
      ...payload,
    });
  }

  if (selection.needsApiKey) {
    return jsonResponse(400, {
      error:
        "Gemini API key missing. Set GEMINI_API_KEY or GOOGLE_API_KEY in .env before using Next.",
      ...payload,
    });
  }

  return generateFromPrompt({
    apiKey: key.value,
    model,
    prompt: selection.prompt,
    category: selection.category,
    seed: selection.seed,
    promptIndex: selection.promptIndex,
    promptCount: selection.promptCount,
    promptMode: selection.promptMode,
    generationConfig,
  });
}

async function handlePromptList(): Promise<Response> {
  if (WEB_PROMPT_MODE !== "fixed") {
    return jsonResponse(200, {
      promptMode: WEB_PROMPT_MODE,
      promptCount: 0,
      prompts: [],
    });
  }

  const prompts = listFixedPrompts().map((entry: { prompt: string; promptIndex: number; promptCount: number }) => ({
    prompt: entry.prompt,
    promptIndex: entry.promptIndex,
    promptCount: entry.promptCount,
    category: "fixed-prompts",
    promptMode: WEB_PROMPT_MODE,
  }));

  return jsonResponse(200, {
    promptMode: WEB_PROMPT_MODE,
    promptCount: prompts.length,
    prompts,
  });
}

async function handleGenerate(request: Request): Promise<Response> {
  const body = await parseJsonBody(request);
  const prompt = readPromptFromBody(body);
  const model = resolveGeminiModel(readModelFromBody(body));
  const generationConfig = readGenerationConfigFromBody(body);
  const category = typeof body.category === "string" ? body.category : "custom";
  const promptMode = typeof body.promptMode === "string" ? body.promptMode : "custom";
  const seed = body.seed && typeof body.seed === "object" ? (body.seed as JsonRecord) : null;
  const promptIndex = Number.isInteger(body.promptIndex) ? (body.promptIndex as number) : null;
  const promptCount = Number.isInteger(body.promptCount) ? (body.promptCount as number) : null;

  if (!prompt) {
    return jsonResponse(400, { error: "Missing prompt." });
  }

  const key = findGeminiKey();
  if (!key) {
    return jsonResponse(400, {
      error:
        "Gemini API key missing. Set GEMINI_API_KEY or GOOGLE_API_KEY in .env before generating.",
      prompt,
      category,
      seed,
      promptIndex,
      promptCount,
      promptMode,
    });
  }

  return generateFromPrompt({
    apiKey: key.value,
    model,
    prompt,
    category,
    seed,
    promptIndex,
    promptCount,
    promptMode,
    generationConfig,
  });
}

async function handleCreateFromSvg(request: Request): Promise<Response> {
  const body = await parseJsonBody(request);
  const rawSvg = readSvgFromBody(body);
  const prompt = readPromptFromBody(body) || "Imported from pasted SVG";

  if (!rawSvg.trim()) {
    return jsonResponse(400, { error: "Missing SVG markup." });
  }

  let preprocessed;
  try {
    preprocessed = preprocessSvg(rawSvg);
  } catch (error) {
    return jsonResponse(422, { error: (error as Error).message });
  }

  const savedAsset = await saveGeneratedSvg({
    svg: preprocessed.svg,
    prompt,
    category: "pasted-svg",
    seed: null,
    promptIndex: null,
    promptCount: null,
    promptMode: "pasted-svg",
    model: "local-paste",
    generationConfig: null,
  });

  return jsonResponse(200, {
    prompt,
    category: "pasted-svg",
    seed: null,
    promptIndex: null,
    promptCount: null,
    promptMode: "pasted-svg",
    svg: preprocessed.svg,
    model: "local-paste",
    finishReason: "imported",
    usageMetadata: null,
    generationConfig: null,
    rawModelResponse: null,
    preprocessNotes: preprocessed.notes,
    savedAsset,
  });
}

async function handlePolishPrompt(request: Request): Promise<Response> {
  const body = await parseJsonBody(request);
  const prompt = readPromptFromBody(body);
  const model = resolveWebPolishModel(readModelFromBody(body));
  const generationConfig = readGenerationConfigFromBody(body);
  const polishPromptTemplate = readPolishPromptTemplateFromBody(body);
  const maxOutputTokens = readPositiveInteger(generationConfig.maxOutputTokens);
  const thinkingLevel = normalizeThinkingLevel(generationConfig.thinkingLevel);

  if (!prompt) {
    return jsonResponse(400, { error: "Missing prompt." });
  }

  const key = findGeminiKey();
  if (!key) {
    return jsonResponse(400, {
      error:
        "Gemini API key missing. Set GEMINI_API_KEY or GOOGLE_API_KEY in .env before polishing prompts.",
      prompt,
    });
  }

  const polished = await polishSvgPrompt({
    apiKey: key.value,
    model,
    userPrompt: prompt,
    examples: FIXED_WEB_PROMPTS,
    promptTemplate: polishPromptTemplate,
    maxOutputTokens,
    thinkingLevel,
  });

  return jsonResponse(200, {
    sourcePrompt: prompt,
    prompt: polished.prompt,
    model: polished.modelVersion,
    exampleCount: FIXED_WEB_PROMPTS.length,
    usedCustomTemplate: Boolean(polishPromptTemplate),
    generationConfig: {
      maxOutputTokens,
      thinkingLevel,
    },
  });
}

async function handlePolishTemplateConfig(): Promise<Response> {
  return jsonResponse(200, {
    template: DEFAULT_PROMPT_POLISH_TEMPLATE,
    placeholders: ["{{examples}}", "{{userPrompt}}"],
  });
}

async function handleDiscordExportPresets(): Promise<Response> {
  return jsonResponse(200, {
    configPresets: DISCORD_EXPORT_CONFIG_PRESET_LIST,
    presets: DISCORD_EXPORT_PRESET_LIST,
  });
}

async function handleDiscordExport(request: Request): Promise<Response> {
  const body = await parseJsonBody(request);
  const presetId = typeof body.presetId === "string" ? body.presetId.trim() : "";
  const configPresetId = typeof body.configPresetId === "string" ? body.configPresetId.trim() : "";
  const svg = typeof body.svg === "string" ? body.svg : "";
  const sourceName = typeof body.sourceName === "string" ? body.sourceName : "discord-export.svg";

  if (!svg.trim()) {
    return jsonResponse(400, { error: "Missing SVG markup." });
  }

  try {
    const result = await exportDiscordAsset({
      svg,
      presetId,
      configPresetId,
      sourceName,
    });
    const { buffer, ...outputWithoutBuffer } = result.output;
    return jsonResponse(200, {
      preset: result.preset,
      output: {
        ...outputWithoutBuffer,
        base64: buffer.toString("base64"),
      },
    });
  } catch (error) {
    if (error instanceof DiscordExportError) {
      return jsonResponse((error as NodeError).statusCode || 422, { error: (error as Error).message });
    }
    throw error;
  }
}

async function handleSavePrompt(request: Request): Promise<Response> {
  const body = await parseJsonBody(request);
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return jsonResponse(400, { error: "Missing prompt." });
  }

  await fs.mkdir(path.dirname(SAVED_PROMPTS_FILE), { recursive: true });
  const record = {
    savedAt: new Date().toISOString(),
    promptMode: typeof body.promptMode === "string" ? body.promptMode : null,
    category: typeof body.category === "string" ? body.category : null,
    promptIndex: Number.isInteger(body.promptIndex) ? body.promptIndex : null,
    promptCount: Number.isInteger(body.promptCount) ? body.promptCount : null,
    seed: body.seed && typeof body.seed === "object" ? body.seed : null,
    prompt,
  };
  await fs.appendFile(SAVED_PROMPTS_FILE, `${JSON.stringify(record)}\n`, "utf8");

  return jsonResponse(200, {
    ok: true,
    file: SAVED_PROMPTS_FILE,
  });
}

async function handleListLibrary(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") || "created";
  const library = await listLibraryItems(scope);
  return jsonResponse(200, library);
}

async function handleLibraryItem(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") || "created";
  const name = url.searchParams.get("name");
  if (!name) {
    return jsonResponse(400, { error: "Missing name." });
  }

  try {
    const item = await readLibrarySvg({ scope, name });
    return jsonResponse(200, item);
  } catch (error) {
    if ((error as NodeError).code === "ENOENT") {
      return jsonResponse(404, { error: "SVG not found." });
    }
    throw error;
  }
}

async function handleLibraryFile(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") || "created";
  const name = url.searchParams.get("name");
  if (!name) {
    return textResponse(400, "Missing name.");
  }

  const activeScope = scope === "archived" ? "archived" : "created";
  const fileName = safeAssetName(name);
  const directory = activeScope === "archived" ? ARCHIVED_SVGS_DIR : CREATED_SVGS_DIR;
  const svgPath = path.join(directory, fileName);

  try {
    const svg = await fs.readFile(svgPath, "utf8");
    return textResponse(200, svg, "image/svg+xml; charset=utf-8");
  } catch (error) {
    if ((error as NodeError).code === "ENOENT") {
      return textResponse(404, "SVG not found.");
    }
    throw error;
  }
}

async function handleHideLibrarySvg(request: Request): Promise<Response> {
  const body = await parseJsonBody(request);
  const name = body.name;
  if (!name) {
    return jsonResponse(400, { error: "Missing name." });
  }

  try {
    const moved = await moveLibrarySvg({
      name,
      fromScope: "created",
      toScope: "archived",
    });
    return jsonResponse(200, { ok: true, moved });
  } catch (error) {
    if ((error as NodeError).code === "ENOENT") {
      return jsonResponse(404, { error: "SVG not found." });
    }
    throw error;
  }
}

async function handleUnhideLibrarySvg(request: Request): Promise<Response> {
  const body = await parseJsonBody(request);
  const name = body.name;
  if (!name) {
    return jsonResponse(400, { error: "Missing name." });
  }

  try {
    const moved = await moveLibrarySvg({
      name,
      fromScope: "archived",
      toScope: "created",
    });
    return jsonResponse(200, { ok: true, moved });
  } catch (error) {
    if ((error as NodeError).code === "ENOENT") {
      return jsonResponse(404, { error: "SVG not found." });
    }
    throw error;
  }
}

async function handleDeleteLibrarySvg(request: Request): Promise<Response> {
  const body = await parseJsonBody(request);
  const name = body.name;
  const scope = body.scope === "archived" ? "archived" : "created";
  if (!name) {
    return jsonResponse(400, { error: "Missing name." });
  }

  try {
    const deleted = await deleteLibrarySvg({ name, scope });
    return jsonResponse(200, { ok: true, deleted });
  } catch (error) {
    if ((error as NodeError).code === "ENOENT") {
      return jsonResponse(404, { error: "SVG not found." });
    }
    throw error;
  }
}

async function routeApiRequest(request: Request): Promise<Response> {
  const method = request.method.toUpperCase();
  const url = new URL(request.url);

  if (method === "POST" && url.pathname === "/api/next-prompt") {
    return handleNextPrompt(request);
  }

  if (method === "POST" && url.pathname === "/api/next") {
    return handleNext(request);
  }

  if (method === "GET" && url.pathname === "/api/prompts") {
    return handlePromptList();
  }

  if (method === "POST" && url.pathname === "/api/save-prompt") {
    return handleSavePrompt(request);
  }

  if (method === "POST" && url.pathname === "/api/generate") {
    return handleGenerate(request);
  }

  if (method === "POST" && url.pathname === "/api/create-from-svg") {
    return handleCreateFromSvg(request);
  }

  if (method === "POST" && url.pathname === "/api/polish-prompt") {
    return handlePolishPrompt(request);
  }

  if (method === "GET" && url.pathname === "/api/polish-template") {
    return handlePolishTemplateConfig();
  }

  if (method === "GET" && url.pathname === "/api/discord-export/presets") {
    return handleDiscordExportPresets();
  }

  if (method === "POST" && url.pathname === "/api/discord-export") {
    return handleDiscordExport(request);
  }

  if (method === "GET" && url.pathname === "/api/library") {
    return handleListLibrary(request);
  }

  if (method === "GET" && url.pathname === "/api/library/item") {
    return handleLibraryItem(request);
  }

  if (method === "GET" && url.pathname === "/api/library/file") {
    return handleLibraryFile(request);
  }

  if (method === "POST" && url.pathname === "/api/library/hide") {
    return handleHideLibrarySvg(request);
  }

  if (method === "POST" && url.pathname === "/api/library/unhide") {
    return handleUnhideLibrarySvg(request);
  }

  if (method === "POST" && url.pathname === "/api/library/delete") {
    return handleDeleteLibrarySvg(request);
  }

  if (url.pathname.startsWith("/api/")) {
    return textResponse(405, "Method not allowed");
  }

  return jsonResponse(404, { error: "Not found." });
}

export async function handleApiRequest(request: Request): Promise<Response> {
  try {
    await ensureRuntimeReady();
    return await routeApiRequest(request);
  } catch (error) {
    return jsonResponse(500, { error: (error as Error).message });
  }
}

export function resolveWebPort(): number {
  return parseNumber(process.env.WEB_PORT, 3000);
}
