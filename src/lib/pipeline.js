const fs = require("fs/promises");
const path = require("path");
const { generateAnimatedSvg } = require("./gemini");
const { preprocessSvg } = require("./preprocess");
const { optimizeSvg } = require("./postprocess");
const { runQa } = require("./qa");
const {
  ensureDir,
  slugify,
  timestampId,
  parseNumber,
  readPrompt,
} = require("./utils");

async function writeJson(filePath, payload) {
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function runPipeline(options) {
  const usingInputSvg = Boolean(options.inputSvg);
  let prompt = "Local SVG input pipeline run.";
  if (!usingInputSvg || options.prompt || options.promptFile) {
    prompt = await readPrompt({
      prompt: options.prompt,
      promptFile: options.promptFile,
    });
  }

  const width = parseNumber(options.width, 1024);
  const height = parseNumber(options.height, 1024);
  const model = String(options.model || "gemini-2.5-flash");
  const render = options.render !== false;
  const renderDelayMs = parseNumber(options.renderDelayMs, 1200);
  const motionThreshold = parseNumber(options.motionThreshold, 0.002);
  const runName = slugify(options.name || prompt.slice(0, 40) || "animated-svg");
  const outRoot = path.resolve(process.cwd(), options.outDir || "runs");
  const runDir = path.join(outRoot, `${timestampId()}-${runName}`);
  await ensureDir(runDir);

  let generation;
  if (usingInputSvg) {
    const inputPath = path.resolve(process.cwd(), options.inputSvg);
    const inputText = await fs.readFile(inputPath, "utf8");
    generation = {
      text: inputText,
      modelVersion: "local-input",
      usageMetadata: null,
    };
  } else {
    generation = await generateAnimatedSvg({
      apiKey: options.apiKey,
      model,
      prompt,
      width,
      height,
      temperature: parseNumber(options.temperature, 1),
    });
  }
  await fs.writeFile(path.join(runDir, "01-prompt.txt"), `${prompt}\n`, "utf8");
  await fs.writeFile(path.join(runDir, "02-raw-response.txt"), generation.text, "utf8");

  const preprocessed = preprocessSvg(generation.text, { width, height });
  await fs.writeFile(path.join(runDir, "03-preprocessed.svg"), preprocessed.svg, "utf8");
  await writeJson(path.join(runDir, "03-preprocess-notes.json"), {
    notes: preprocessed.notes,
  });

  const qaPre = await runQa(preprocessed.svg, {
    render,
    outputDir: runDir,
    label: "preprocessed",
    delayMs: renderDelayMs,
    motionThreshold,
  });
  await writeJson(path.join(runDir, "04-qa-preprocessed.json"), qaPre);

  const optimized = optimizeSvg(preprocessed.svg);
  await fs.writeFile(path.join(runDir, "05-optimized.svg"), optimized.svg, "utf8");

  const qaPost = await runQa(optimized.svg, {
    render,
    outputDir: runDir,
    label: "optimized",
    delayMs: renderDelayMs,
    motionThreshold,
  });
  await writeJson(path.join(runDir, "06-qa-optimized.json"), qaPost);

  const summary = {
    runDir,
    modelRequested: usingInputSvg ? null : model,
    modelUsed: generation.modelVersion,
    promptLength: prompt.length,
    options: {
      width,
      height,
      render,
      renderDelayMs,
      motionThreshold,
    },
    qa: {
      preprocessed: qaPre.summary,
      optimized: qaPost.summary,
    },
    usageMetadata: generation.usageMetadata,
  };
  await writeJson(path.join(runDir, "07-summary.json"), summary);

  return summary;
}

async function runQaOnly(options) {
  const inputPath = options.input
    ? path.resolve(process.cwd(), options.input)
    : null;
  if (!inputPath) {
    throw new Error("QA mode requires --input path/to/file.svg");
  }

  const svg = await fs.readFile(inputPath, "utf8");
  const qaOutDir = options.outDir
    ? path.resolve(process.cwd(), options.outDir)
    : null;
  if (qaOutDir) {
    await ensureDir(qaOutDir);
  }

  const report = await runQa(svg, {
    render: options.render !== false,
    outputDir: qaOutDir,
    label: options.name ? slugify(options.name) : "qa",
    delayMs: parseNumber(options.renderDelayMs, 1200),
    motionThreshold: parseNumber(options.motionThreshold, 0.002),
  });

  return report;
}

module.exports = {
  runPipeline,
  runQaOnly,
};
