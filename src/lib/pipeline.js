const fs = require("fs/promises");
const path = require("path");
const { generateAnimatedSvg } = require("./gemini");
const { resolveGeminiModel } = require("./env");
const { preprocessSvg } = require("./preprocess");
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

function parseOptionalPositiveNumber(input) {
  if (input === undefined || input === null) {
    return null;
  }
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
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

  const width = parseOptionalPositiveNumber(options.width);
  const height = parseOptionalPositiveNumber(options.height);
  const model = resolveGeminiModel(options.model);
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

  const preprocessed = preprocessSvg(generation.text);
  await fs.writeFile(path.join(runDir, "03-preprocessed.svg"), preprocessed.svg, "utf8");
  await writeJson(path.join(runDir, "03-preprocess-notes.json"), {
    notes: preprocessed.notes,
  });

  const qa = await runQa(preprocessed.svg);
  await writeJson(path.join(runDir, "04-qa.json"), qa);

  const summary = {
    runDir,
    modelRequested: usingInputSvg ? null : model,
    modelUsed: generation.modelVersion,
    promptLength: prompt.length,
    options: {
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
    },
    qa: qa.summary,
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
  void options.outDir;
  void options.name;
  const report = await runQa(svg);

  return report;
}

module.exports = {
  runPipeline,
  runQaOnly,
};
