const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { loadEnv, findGeminiKey, resolveGeminiModel, DEFAULT_GEMINI_MODEL } = require("./lib/env");
const { ensureDir, parseNumber, slugify, timestampId } = require("./lib/utils");
const { buildMadlibSeed, buildMadlibText } = require("./lib/madlib");
const { FIXED_WEB_PROMPTS, getNextFixedPrompt, listFixedPrompts } = require("./lib/web-prompts");
const { expandMadlibPrompt, generateAnimatedSvg, polishSvgPrompt } = require("./lib/gemini");
const { preprocessSvg } = require("./lib/preprocess");

const HOST = "127.0.0.1";
const PORT = parseNumber(process.env.WEB_PORT, 3000);
const WEB_PROMPT_MODE = String(process.env.WEB_PROMPT_MODE || "fixed").toLowerCase();
const PUBLIC_DIR = path.resolve(process.cwd(), "web");
const SAVED_PROMPTS_FILE = path.resolve(process.cwd(), "prompts", "saved-prompts.jsonl");
const LIBRARY_ROOT = path.resolve(process.cwd(), "results");
const CREATED_SVGS_DIR = path.resolve(LIBRARY_ROOT, "web-created");
const ARCHIVED_SVGS_DIR = path.resolve(LIBRARY_ROOT, "web-archived");
const EXAMPLES_DIR = path.resolve(process.cwd(), "examples");
const LIBRARY_SEED_MARKER = path.resolve(LIBRARY_ROOT, ".web-library-seeded.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};
const ALLOWED_THINKING_LEVELS = new Set(["off", "low", "medium", "high"]);

function json(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(payload)}\n`);
}

function safeAssetName(inputName) {
  const name = String(inputName || "").trim();
  if (!name) {
    throw new Error("Missing SVG name.");
  }
  if (path.basename(name) !== name || !name.toLowerCase().endsWith(".svg")) {
    throw new Error("Invalid SVG name.");
  }
  return name;
}

function metadataPathFor(directory, svgName) {
  const baseName = svgName.slice(0, -4);
  return path.join(directory, `${baseName}.json`);
}

async function readJsonIfPresent(targetPath) {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function resolveUniqueName(directory, fileName) {
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

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function countSvgFiles(directory) {
  await ensureDir(directory);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".svg")).length;
}

function titleFromFileName(fileName) {
  const stem = path.basename(fileName, ".svg");
  const words = stem.split(/[-_]+/).filter(Boolean);
  if (!words.length) {
    return "Starter SVG Example";
  }
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

async function seedStarterLibraryIfNeeded() {
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

  let exampleEntries = [];
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
  const seededFiles = [];

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
}) {
  await ensureDir(CREATED_SVGS_DIR);
  const stamp = timestampId();
  const promptSlug = slugify(prompt || "svg");
  const fileName = await resolveUniqueName(
    CREATED_SVGS_DIR,
    `${stamp}-${promptSlug || "svg"}.svg`,
  );
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

async function listLibraryItems(scope = "created") {
  const activeScope = scope === "archived" ? "archived" : "created";
  const directory = activeScope === "archived" ? ARCHIVED_SVGS_DIR : CREATED_SVGS_DIR;
  await ensureDir(directory);
  await ensureDir(CREATED_SVGS_DIR);
  await ensureDir(ARCHIVED_SVGS_DIR);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const svgEntries = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".svg"))
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
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".svg"),
    ).length;
  }

  return {
    scope: activeScope,
    items,
    archivedCount,
  };
}

async function readLibrarySvg({ scope = "created", name }) {
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

async function moveLibrarySvg({ name, fromScope, toScope }) {
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
    if (error && error.code !== "ENOENT") {
      throw error;
    }
  }

  return { name: targetName, scope: toScope };
}

async function parseBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function readModelFromBody(body) {
  if (typeof body?.model === "string" && body.model.trim().length > 0) {
    return body.model.trim();
  }
  return null;
}

function resolveWebPolishModel(requestedModel) {
  const fromBody = readModelFromBody({ model: requestedModel });
  if (fromBody) {
    return fromBody;
  }
  if (typeof process.env.WEB_POLISH_MODEL === "string" && process.env.WEB_POLISH_MODEL.trim().length > 0) {
    return process.env.WEB_POLISH_MODEL.trim();
  }
  return DEFAULT_GEMINI_MODEL;
}

function readPositiveInteger(input) {
  if (input === null || input === undefined || input === "") {
    return null;
  }
  const value = Number.parseInt(String(input), 10);
  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function normalizeThinkingLevel(input) {
  const value = String(input || "low").toLowerCase();
  if (!ALLOWED_THINKING_LEVELS.has(value)) {
    return "low";
  }
  return value;
}

function readGenerationConfigFromBody(body) {
  const maxOutputTokens = readPositiveInteger(body?.maxOutputTokens);
  const thinkingLevel = normalizeThinkingLevel(body?.thinkingLevel);
  return {
    maxOutputTokens,
    thinkingLevel,
  };
}

async function serveStatic(urlPath, response) {
  let cleanPath = urlPath;
  if (cleanPath === "/") {
    cleanPath = "/grid.html";
  } else if (cleanPath === "/generate" || cleanPath === "/workbench") {
    cleanPath = "/index.html";
  } else if (cleanPath === "/grid" || cleanPath === "/library") {
    cleanPath = "/grid.html";
  }
  const target = path.resolve(PUBLIC_DIR, `.${cleanPath}`);
  if (!target.startsWith(PUBLIC_DIR)) {
    response.statusCode = 403;
    response.end("Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(target);
    if (!stat.isFile()) {
      response.statusCode = 404;
      response.end("Not found");
      return;
    }

    const extension = path.extname(target).toLowerCase();
    response.setHeader("Content-Type", MIME_TYPES[extension] || "application/octet-stream");
    response.end(await fs.readFile(target));
  } catch {
    response.statusCode = 404;
    response.end("Not found");
  }
}

async function handleNext(request, response) {
  const body = await parseBody(request);
  const model = resolveGeminiModel(readModelFromBody(body));
  const generationConfig = readGenerationConfigFromBody(body);
  const key = findGeminiKey();
  const selection = await resolveNextPromptSelection({
    model,
    apiKey: key ? key.value : null,
  });
  const payload = toPromptSelectionPayload(selection);

  if (!key) {
    json(response, 400, {
      error:
        "Gemini API key missing. Set GEMINI_API_KEY or GOOGLE_API_KEY in .env before using Next.",
      ...payload,
    });
    return;
  }

  if (selection.needsApiKey) {
    json(response, 400, {
      error:
        "Gemini API key missing. Set GEMINI_API_KEY or GOOGLE_API_KEY in .env before using Next.",
      ...payload,
    });
    return;
  }

  await generateFromPrompt({
    response,
    apiKey: key.value,
    model,
    generationConfig,
    ...payload,
  });
}

async function resolveNextPromptSelection({ model, apiKey }) {
  let prompt = "";
  let category = null;
  let seed = null;
  let promptIndex = null;
  let promptCount = null;
  let needsApiKey = false;

  if (WEB_PROMPT_MODE === "madlib") {
    seed = buildMadlibSeed();
    category = seed.category;

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

function toPromptSelectionPayload(selection) {
  return {
    prompt: selection.prompt,
    category: selection.category,
    seed: selection.seed,
    promptIndex: selection.promptIndex,
    promptCount: selection.promptCount,
    promptMode: selection.promptMode,
  };
}

async function handleNextPrompt(request, response) {
  const body = await parseBody(request);
  const model = resolveGeminiModel(readModelFromBody(body));
  const key = findGeminiKey();
  const selection = await resolveNextPromptSelection({
    model,
    apiKey: key ? key.value : null,
  });
  const payload = toPromptSelectionPayload(selection);

  if (selection.needsApiKey) {
    json(response, 400, {
      error:
        "Gemini API key missing. Set GEMINI_API_KEY or GOOGLE_API_KEY in .env before using Next.",
      ...payload,
    });
    return;
  }

  json(response, 200, payload);
}

async function handlePromptList(response) {
  if (WEB_PROMPT_MODE !== "fixed") {
    json(response, 200, {
      promptMode: WEB_PROMPT_MODE,
      promptCount: 0,
      prompts: [],
    });
    return;
  }

  const prompts = listFixedPrompts().map((entry) => ({
    prompt: entry.prompt,
    promptIndex: entry.promptIndex,
    promptCount: entry.promptCount,
    category: "fixed-prompts",
    promptMode: WEB_PROMPT_MODE,
  }));

  json(response, 200, {
    promptMode: WEB_PROMPT_MODE,
    promptCount: prompts.length,
    prompts,
  });
}

async function generateFromPrompt({
  response,
  apiKey,
  model,
  prompt,
  category = null,
  seed = null,
  promptIndex = null,
  promptCount = null,
  promptMode = "custom",
  generationConfig = null,
}) {
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
    json(response, 422, {
      error: error.message,
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
    return;
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

  json(response, 200, {
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

function readPromptFromBody(body) {
  return typeof body.prompt === "string" ? body.prompt.trim() : "";
}

async function handleGenerate(request, response) {
  const body = await parseBody(request);
  const prompt = readPromptFromBody(body);
  const model = resolveGeminiModel(readModelFromBody(body));
  const generationConfig = readGenerationConfigFromBody(body);
  const category = typeof body.category === "string" ? body.category : "custom";
  const promptMode = typeof body.promptMode === "string" ? body.promptMode : "custom";
  const seed = body.seed && typeof body.seed === "object" ? body.seed : null;
  const promptIndex = Number.isInteger(body.promptIndex) ? body.promptIndex : null;
  const promptCount = Number.isInteger(body.promptCount) ? body.promptCount : null;
  if (!prompt) {
    json(response, 400, { error: "Missing prompt." });
    return;
  }

  const key = findGeminiKey();
  if (!key) {
    json(response, 400, {
      error:
        "Gemini API key missing. Set GEMINI_API_KEY or GOOGLE_API_KEY in .env before generating.",
      prompt,
      category,
      seed,
      promptIndex,
      promptCount,
      promptMode,
    });
    return;
  }

  await generateFromPrompt({
    response,
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

async function handlePolishPrompt(request, response) {
  const body = await parseBody(request);
  const prompt = readPromptFromBody(body);
  const model = resolveWebPolishModel(readModelFromBody(body));
  const generationConfig = readGenerationConfigFromBody(body);
  const maxOutputTokens = readPositiveInteger(generationConfig.maxOutputTokens);
  const thinkingLevel = normalizeThinkingLevel(generationConfig.thinkingLevel);
  if (!prompt) {
    json(response, 400, { error: "Missing prompt." });
    return;
  }

  const key = findGeminiKey();
  if (!key) {
    json(response, 400, {
      error:
        "Gemini API key missing. Set GEMINI_API_KEY or GOOGLE_API_KEY in .env before polishing prompts.",
      prompt,
    });
    return;
  }

  const polished = await polishSvgPrompt({
    apiKey: key.value,
    model,
    userPrompt: prompt,
    examples: FIXED_WEB_PROMPTS,
    maxOutputTokens,
    thinkingLevel,
  });

  json(response, 200, {
    sourcePrompt: prompt,
    prompt: polished.prompt,
    model: polished.modelVersion,
    exampleCount: FIXED_WEB_PROMPTS.length,
    generationConfig: {
      maxOutputTokens,
      thinkingLevel,
    },
  });
}

async function handleSavePrompt(request, response) {
  const body = await parseBody(request);
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    json(response, 400, { error: "Missing prompt." });
    return;
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

  json(response, 200, {
    ok: true,
    file: SAVED_PROMPTS_FILE,
  });
}

async function handleListLibrary(url, response) {
  const scope = url.searchParams.get("scope") || "created";
  const library = await listLibraryItems(scope);
  json(response, 200, library);
}

async function handleLibraryItem(url, response) {
  const scope = url.searchParams.get("scope") || "created";
  const name = url.searchParams.get("name");
  if (!name) {
    json(response, 400, { error: "Missing name." });
    return;
  }

  try {
    const item = await readLibrarySvg({ scope, name });
    json(response, 200, item);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      json(response, 404, { error: "SVG not found." });
      return;
    }
    throw error;
  }
}

async function handleLibraryFile(url, response) {
  const scope = url.searchParams.get("scope") || "created";
  const name = url.searchParams.get("name");
  if (!name) {
    response.statusCode = 400;
    response.end("Missing name.");
    return;
  }

  const activeScope = scope === "archived" ? "archived" : "created";
  const fileName = safeAssetName(name);
  const directory = activeScope === "archived" ? ARCHIVED_SVGS_DIR : CREATED_SVGS_DIR;
  const svgPath = path.join(directory, fileName);

  try {
    const svg = await fs.readFile(svgPath, "utf8");
    response.statusCode = 200;
    response.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    response.end(svg);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      response.statusCode = 404;
      response.end("SVG not found.");
      return;
    }
    throw error;
  }
}

async function handleHideLibrarySvg(request, response) {
  const body = await parseBody(request);
  const name = body.name;
  if (!name) {
    json(response, 400, { error: "Missing name." });
    return;
  }
  try {
    const moved = await moveLibrarySvg({
      name,
      fromScope: "created",
      toScope: "archived",
    });
    json(response, 200, { ok: true, moved });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      json(response, 404, { error: "SVG not found." });
      return;
    }
    throw error;
  }
}

async function handleUnhideLibrarySvg(request, response) {
  const body = await parseBody(request);
  const name = body.name;
  if (!name) {
    json(response, 400, { error: "Missing name." });
    return;
  }
  try {
    const moved = await moveLibrarySvg({
      name,
      fromScope: "archived",
      toScope: "created",
    });
    json(response, 200, { ok: true, moved });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      json(response, 404, { error: "SVG not found." });
      return;
    }
    throw error;
  }
}

async function route(request, response) {
  const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);

  if (request.method === "POST" && url.pathname === "/api/next-prompt") {
    await handleNextPrompt(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/next") {
    await handleNext(request, response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/prompts") {
    await handlePromptList(response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/save-prompt") {
    await handleSavePrompt(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/generate") {
    await handleGenerate(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/polish-prompt") {
    await handlePolishPrompt(request, response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/library") {
    await handleListLibrary(url, response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/library/item") {
    await handleLibraryItem(url, response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/library/file") {
    await handleLibraryFile(url, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/library/hide") {
    await handleHideLibrarySvg(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/library/unhide") {
    await handleUnhideLibrarySvg(request, response);
    return;
  }

  if (request.method === "GET") {
    await serveStatic(url.pathname, response);
    return;
  }

  response.statusCode = 405;
  response.end("Method not allowed");
}

async function main() {
  loadEnv();
  await fs.mkdir(PUBLIC_DIR, { recursive: true });
  await ensureDir(CREATED_SVGS_DIR);
  await ensureDir(ARCHIVED_SVGS_DIR);
  await seedStarterLibraryIfNeeded();

  const server = http.createServer((request, response) => {
    route(request, response).catch((error) => {
      json(response, 500, { error: error.message });
    });
  });

  await new Promise((resolve) => server.listen(PORT, HOST, resolve));
  process.stdout.write(`Web app running at http://${HOST}:${PORT}\n`);
}

main().catch((error) => {
  process.stderr.write(`Failed to start web app: ${error.message}\n`);
  process.exit(1);
});
