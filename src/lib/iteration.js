const fs = require("fs/promises");
const path = require("path");
const { runPipeline } = require("./pipeline");
const { ensureDir, slugify } = require("./utils");

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${error.message}`);
  }
}

function normalizeExperiment(raw, index) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Experiment at index ${index} must be an object.`);
  }

  const id = slugify(raw.id || `exp-${index + 1}`) || `exp-${index + 1}`;
  const label = String(raw.name || raw.id || `Experiment ${index + 1}`);
  const notes = typeof raw.notes === "string" ? raw.notes : null;

  const directOverrides = Object.fromEntries(
    Object.entries(raw).filter(([key]) => !["id", "name", "notes", "overrides"].includes(key)),
  );
  const overrides =
    raw.overrides && typeof raw.overrides === "object" && !Array.isArray(raw.overrides)
      ? { ...directOverrides, ...raw.overrides }
      : directOverrides;

  return {
    id,
    label,
    notes,
    overrides,
  };
}

function normalizeConfig(config, configPath) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`Config must be a JSON object: ${configPath}`);
  }

  const base =
    config.base && typeof config.base === "object" && !Array.isArray(config.base)
      ? config.base
      : {};
  const experimentsRaw = Array.isArray(config.experiments)
    ? config.experiments
    : [{ id: "baseline", name: "Baseline", overrides: {} }];
  const experiments = experimentsRaw.map(normalizeExperiment);

  const name = slugify(config.name || path.basename(configPath, path.extname(configPath))) || "iter";
  const outDir = config.outDir ? String(config.outDir) : "runs-lab";

  return {
    name,
    title: String(config.title || config.name || "SVG Iteration Lab"),
    outDir,
    base,
    experiments,
  };
}

function parseOnlyFilter(onlyValue) {
  if (!onlyValue) {
    return null;
  }
  const ids = String(onlyValue)
    .split(",")
    .map((item) => slugify(item))
    .filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
}

async function loadIterationConfig(configPath) {
  const absolutePath = path.resolve(process.cwd(), configPath);
  const text = await fs.readFile(absolutePath, "utf8");
  const parsed = parseJson(text, absolutePath);
  const normalized = normalizeConfig(parsed, absolutePath);
  return {
    ...normalized,
    absolutePath,
  };
}

async function runIteration({
  configPath,
  apiKey,
  only,
  onExperimentStart,
  onExperimentDone,
}) {
  const config = await loadIterationConfig(configPath);
  const outDir = path.resolve(process.cwd(), config.outDir);
  await ensureDir(outDir);

  const onlySet = parseOnlyFilter(only);
  const experiments = onlySet
    ? config.experiments.filter((exp) => onlySet.has(exp.id))
    : config.experiments;

  if (experiments.length === 0) {
    throw new Error("No experiments selected. Check --only filter values.");
  }

  const results = [];
  const startedAt = new Date().toISOString();

  for (const experiment of experiments) {
    if (onExperimentStart) {
      await onExperimentStart(experiment);
    }

    const options = {
      ...config.base,
      ...experiment.overrides,
      outDir,
      name: `${config.name}-${experiment.id}`,
    };

    const requiresApi = !options.inputSvg;
    if (requiresApi && !apiKey) {
      throw new Error(
        `Experiment "${experiment.id}" requires Gemini generation but no API key was found.`,
      );
    }

    const runStarted = Date.now();
    const summary = await runPipeline({
      ...options,
      apiKey: requiresApi ? apiKey : null,
    });
    const durationMs = Date.now() - runStarted;

    const result = {
      id: experiment.id,
      label: experiment.label,
      notes: experiment.notes,
      durationMs,
      runDir: summary.runDir,
      qa: summary.qa,
      model: summary.modelUsed,
      options: summary.options,
    };
    results.push(result);

    if (onExperimentDone) {
      await onExperimentDone(result);
    }
  }

  const report = {
    createdAt: new Date().toISOString(),
    startedAt,
    configPath: config.absolutePath,
    title: config.title,
    outDir,
    totalExperiments: results.length,
    results,
  };

  const reportPath = path.join(outDir, "iteration-report.json");
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  return {
    ...report,
    reportPath,
  };
}

module.exports = {
  runIteration,
  loadIterationConfig,
};
