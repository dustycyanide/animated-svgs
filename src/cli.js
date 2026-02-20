#!/usr/bin/env node
const path = require("path");
const fs = require("fs/promises");
const fscore = require("fs");
const { parseArgs, parseNumber } = require("./lib/utils");
const { DEFAULT_GEMINI_MODEL, findGeminiKey, loadEnv } = require("./lib/env");
const { runPipeline, runQaOnly } = require("./lib/pipeline");
const { runIteration } = require("./lib/iteration");
const { generateDashboard } = require("./lib/dashboard");
const { startViewServer } = require("./lib/view-server");

function flagValue(flags, camelName) {
  if (Object.prototype.hasOwnProperty.call(flags, camelName)) {
    return flags[camelName];
  }
  const kebabName = camelName.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return flags[kebabName];
}

function printHelp() {
  const help = `
animated-svgs CLI

Usage:
  node src/cli.js run --prompt "..." [--model ${DEFAULT_GEMINI_MODEL}] [--out-dir runs] [--name demo]
  node src/cli.js run --prompt-file ./prompt.txt
  node src/cli.js run --input-svg ./existing.svg [--name local-pass]
  node src/cli.js qa --input ./file.svg [--out-dir ./qa-out]
  node src/cli.js iterate --config configs/iteration.local.json [--only a,b] [--watch]
  node src/cli.js dashboard --dir runs-lab
  node src/cli.js view --dir runs-lab --port 4173
  node src/cli.js check-key

Flags:
  --prompt               Prompt text for generation
  --prompt-file          Path to a prompt file
  --model                Gemini model name (default: GEMINI_MODEL or ${DEFAULT_GEMINI_MODEL})
  --width                Optional width hint for generation
  --height               Optional height hint for generation
  --temperature          Sampling temperature (default: 1)
  --out-dir              Output directory
  --name                 Name/slug for run artifacts
  --input-svg            Skip Gemini and run pipeline from a local SVG file
  --input                SVG file input for qa mode
  --report               Optional JSON output path for qa mode
  --config               Iteration JSON config path
  --only                 Comma-separated experiment IDs to run
  --watch                Watch config file and rerun iteration on change
  --dir                  Run directory root for dashboard/view
  --title                Dashboard title
  --port                 HTTP port for view server
`;
  process.stdout.write(help);
}

function getGeminiApiKeyValue() {
  const key = findGeminiKey();
  return key ? key.value : null;
}

async function commandCheckKey() {
  const key = findGeminiKey();
  if (!key) {
    process.stderr.write(
      "No Gemini API key found. Set GEMINI_API_KEY (preferred) or GOOGLE_API_KEY in .env.\n",
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Gemini API key found in ${key.name} (value hidden).\n`);
}

async function commandRun(flags) {
  const inputSvg = flagValue(flags, "inputSvg");

  let apiKey = null;
  if (!inputSvg) {
    apiKey = getGeminiApiKeyValue();
    if (!apiKey) {
      throw new Error(
        "No Gemini API key found. Set GEMINI_API_KEY (preferred) or GOOGLE_API_KEY in .env.",
      );
    }
  }

  const options = {
    prompt: flagValue(flags, "prompt"),
    promptFile: flagValue(flags, "promptFile"),
    model: flagValue(flags, "model"),
    width: flagValue(flags, "width"),
    height: flagValue(flags, "height"),
    temperature: flagValue(flags, "temperature"),
    outDir: flagValue(flags, "outDir"),
    name: flagValue(flags, "name"),
    inputSvg,
    apiKey,
  };

  const summary = await runPipeline(options);

  process.stdout.write(
    [
      "Pipeline complete.",
      `Run directory: ${summary.runDir}`,
      `Model: ${summary.modelUsed}`,
      `QA passed: ${summary.qa.passed} (issues: ${summary.qa.issueCount})`,
    ].join("\n") + "\n",
  );
}

async function commandQa(flags) {
  const options = {
    input: flagValue(flags, "input"),
    outDir: flagValue(flags, "outDir"),
  };

  const report = await runQaOnly(options);
  const output =
    flagValue(flags, "report") ||
    (options.outDir ? path.join(String(options.outDir), "qa-report.json") : null);
  if (output) {
    const reportPath = path.resolve(process.cwd(), output);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`QA report written: ${reportPath}\n`);
  }
  process.stdout.write(`QA passed: ${report.summary.passed} (issues: ${report.summary.issueCount})\n`);
}

async function executeIteration(flags) {
  const configPath = flagValue(flags, "config") || "configs/iteration.local.json";
  const only = flagValue(flags, "only");
  const report = await runIteration({
    configPath,
    only,
    apiKey: getGeminiApiKeyValue(),
    onExperimentStart: async (experiment) => {
      process.stdout.write(`Starting ${experiment.id}: ${experiment.label}\n`);
    },
    onExperimentDone: async (result) => {
      process.stdout.write(
        `Finished ${result.id} in ${result.durationMs}ms | QA passed: ${result.qa.passed} (issues: ${result.qa.issueCount})\n`,
      );
    },
  });

  const dashboard = await generateDashboard({
    outDir: report.outDir,
    title: report.title,
  });

  process.stdout.write(
    [
      "Iteration complete.",
      `Experiments: ${report.totalExperiments}`,
      `Report: ${report.reportPath}`,
      `Dashboard: ${dashboard.htmlPath}`,
    ].join("\n") + "\n",
  );

  return report;
}

async function commandIterate(flags) {
  const watch = flagValue(flags, "watch") === true;
  const configPath = path.resolve(
    process.cwd(),
    flagValue(flags, "config") || "configs/iteration.local.json",
  );

  if (!watch) {
    await executeIteration(flags);
    return;
  }

  let running = false;
  let queued = false;

  const trigger = async () => {
    if (running) {
      queued = true;
      return;
    }

    running = true;
    do {
      queued = false;
      try {
        await executeIteration(flags);
      } catch (error) {
        process.stderr.write(`Iteration error: ${error.message}\n`);
      }
    } while (queued);
    running = false;
  };

  await trigger();

  process.stdout.write(`Watching config for changes: ${configPath}\n`);
  const watcher = fscore.watch(configPath, { persistent: true }, () => {
    setTimeout(() => {
      trigger().catch((error) => {
        process.stderr.write(`Watch trigger failed: ${error.message}\n`);
      });
    }, 250);
  });

  await new Promise((resolve) => {
    const stop = () => {
      watcher.close();
      resolve();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

async function commandDashboard(flags) {
  const outDir = flagValue(flags, "dir") || "runs-lab";
  const title = flagValue(flags, "title");
  const result = await generateDashboard({ outDir, title });
  process.stdout.write(`Dashboard written: ${result.htmlPath}\n`);
}

async function commandView(flags) {
  const dir = flagValue(flags, "dir") || "runs-lab";
  const title = flagValue(flags, "title");
  const port = parseNumber(flagValue(flags, "port"), 4173);
  const { server, rootDir } = await startViewServer({ dir, port, title });
  process.stdout.write(`Viewer running: http://localhost:${port}/\n`);
  process.stdout.write(`Serving directory: ${rootDir}\n`);

  await new Promise((resolve) => {
    const stop = () => {
      server.close(() => {
        resolve();
      });
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

async function main() {
  loadEnv();

  const argv = process.argv.slice(2);
  const flags = parseArgs(argv);
  const command = flags._[0] || "run";

  if (flags.help || command === "help") {
    printHelp();
    return;
  }

  if (command === "check-key") {
    await commandCheckKey();
    return;
  }

  if (command === "qa") {
    await commandQa(flags);
    return;
  }

  if (command === "run") {
    await commandRun(flags);
    return;
  }

  if (command === "iterate") {
    await commandIterate(flags);
    return;
  }

  if (command === "dashboard") {
    await commandDashboard(flags);
    return;
  }

  if (command === "view") {
    await commandView(flags);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exit(1);
});
