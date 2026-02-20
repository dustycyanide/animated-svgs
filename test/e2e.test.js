const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

test("CLI pipeline end-to-end works in local input mode", async () => {
  const projectRoot = path.resolve(__dirname, "..");
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "animated-svgs-e2e-"));
  const outDir = path.join(tmpRoot, "runs");

  try {
    const cliPath = path.join(projectRoot, "src", "cli.js");
    const inputSvg = path.join(projectRoot, "examples", "pulse.svg");
    const promptFile = path.join(projectRoot, "prompts", "neon-orbit.txt");

    const { stdout } = await execFileAsync(
      process.execPath,
      [
        cliPath,
        "run",
        "--input-svg",
        inputSvg,
        "--prompt-file",
        promptFile,
        "--out-dir",
        outDir,
        "--name",
        "e2e",
      ],
      {
        cwd: projectRoot,
        env: process.env,
      },
    );

    assert.match(stdout, /Pipeline complete\./);

    const entries = await fs.readdir(outDir, { withFileTypes: true });
    const runDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    assert.equal(runDirs.length, 1);

    const runDir = path.join(outDir, runDirs[0]);
    const requiredArtifacts = [
      "01-prompt.txt",
      "02-raw-response.txt",
      "03-preprocess-notes.json",
      "03-preprocessed.svg",
      "04-qa.json",
      "07-summary.json",
    ];

    for (const fileName of requiredArtifacts) {
      await fs.access(path.join(runDir, fileName));
    }

    const summaryPath = path.join(runDir, "07-summary.json");
    const summary = JSON.parse(await fs.readFile(summaryPath, "utf8"));
    assert.equal(summary.modelUsed, "local-input");
    assert.equal(summary.qa.passed, true);
    assert.equal(typeof summary.qa.issueCount, "number");

    const preprocessedSvg = await fs.readFile(path.join(runDir, "03-preprocessed.svg"), "utf8");
    assert.match(preprocessedSvg, /<svg\b/i);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});
