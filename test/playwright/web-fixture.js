const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");
const { once } = require("node:events");
const { spawn } = require("node:child_process");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = address && typeof address === "object" ? address.port : null;
  await new Promise((resolve) => server.close(resolve));
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("Failed to allocate free port.");
  }
  return port;
}

async function requestRaw({ method, url }) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: target.hostname,
        port: Number(target.port),
        path: `${target.pathname}${target.search}`,
        method,
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode || 0,
            body: raw,
          });
        });
      },
    );
    request.on("error", reject);
    request.end();
  });
}

async function waitForServer(url, child, { timeoutMs = 25_000 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Web server exited early with code ${child.exitCode}.`);
    }
    try {
      const response = await requestRaw({ method: "GET", url });
      if (response.statusCode >= 200 && response.statusCode < 500) {
        return;
      }
    } catch {
      // Keep polling.
    }
    await sleep(140);
  }
  throw new Error("Timed out waiting for web server startup.");
}

async function setDeterministicMtime(targetPath, isoTime) {
  const timestamp = new Date(isoTime);
  await fs.utimes(targetPath, timestamp, timestamp);
}

async function writeLibraryAsset({
  scope,
  rootDir,
  name,
  svg,
  prompt,
  category,
  createdAt,
  updatedAt,
}) {
  const scopeDir = scope === "archived" ? "web-archived" : "web-created";
  const directory = path.join(rootDir, "results", scopeDir);
  await fs.mkdir(directory, { recursive: true });

  const svgPath = path.join(directory, name);
  const metaPath = path.join(directory, `${path.basename(name, ".svg")}.json`);
  const meta = {
    name,
    createdAt,
    prompt,
    category,
    seed: null,
    promptIndex: null,
    promptCount: null,
    promptMode: "fixture",
    model: "local-fixture",
    generationConfig: null,
  };

  await fs.writeFile(svgPath, `${svg.trim()}\n`, "utf8");
  await fs.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  await setDeterministicMtime(svgPath, updatedAt);
  await setDeterministicMtime(metaPath, updatedAt);
}

async function createWorkspaceFixture() {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "animated-svgs-playwright-ui-"));

  await fs.mkdir(path.join(tmpRoot, "examples"), { recursive: true });
  await fs.mkdir(path.join(tmpRoot, "prompts"), { recursive: true });
  await fs.mkdir(path.join(tmpRoot, "results", "web-created"), { recursive: true });
  await fs.mkdir(path.join(tmpRoot, "results", "web-archived"), { recursive: true });

  // Prevent startup seeding from copying mutable example fixtures into library.
  await fs.writeFile(
    path.join(tmpRoot, "results", ".web-library-seeded.json"),
    `${JSON.stringify(
      {
        seededAt: "2024-01-01T00:00:00.000Z",
        seededCount: 0,
        skipped: true,
        reason: "playwright-fixture",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await writeLibraryAsset({
    scope: "created",
    rootDir: tmpRoot,
    name: "fixture-aqua-rings.svg",
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <rect width="128" height="128" fill="#0c4a6e" />
        <circle cx="64" cy="64" r="38" fill="none" stroke="#22d3ee" stroke-width="8" />
      </svg>
    `,
    prompt: "Aqua concentric rings",
    category: "fixture-grid",
    createdAt: "2024-01-03T10:00:00.000Z",
    updatedAt: "2024-01-03T10:00:00.000Z",
  });

  await writeLibraryAsset({
    scope: "created",
    rootDir: tmpRoot,
    name: "fixture-solar-blocks.svg",
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <rect width="128" height="128" fill="#7c2d12" />
        <rect x="24" y="24" width="80" height="80" fill="#fbbf24" />
      </svg>
    `,
    prompt: "Solar stacked blocks",
    category: "fixture-grid",
    createdAt: "2024-01-02T09:00:00.000Z",
    updatedAt: "2024-01-02T09:00:00.000Z",
  });

  await writeLibraryAsset({
    scope: "archived",
    rootDir: tmpRoot,
    name: "fixture-forest-diamond.svg",
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <rect width="128" height="128" fill="#14532d" />
        <polygon points="64,20 104,64 64,108 24,64" fill="#86efac" />
      </svg>
    `,
    prompt: "Forest diamond tile",
    category: "fixture-grid",
    createdAt: "2024-01-01T08:00:00.000Z",
    updatedAt: "2024-01-01T08:00:00.000Z",
  });

  return tmpRoot;
}

async function startWebServer({ projectRoot, cwd }) {
  const port = await getFreePort();
  const serverScript = path.join(projectRoot, "src", "web-server.js");

  const child = spawn(process.execPath, [serverScript], {
    cwd,
    env: {
      ...process.env,
      WEB_PORT: String(port),
      GEMINI_API_KEY: "",
      GOOGLE_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer(`http://127.0.0.1:${port}/api/library?scope=created`, child);
  } catch (error) {
    const details = [error.message, stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
    throw new Error(details);
  }

  return {
    child,
    baseUrl: `http://127.0.0.1:${port}`,
  };
}

async function stopWebServer(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  const exitPromise = once(child, "exit");
  const timeoutPromise = sleep(8_000).then(() => {
    throw new Error("Timed out stopping web server.");
  });

  try {
    await Promise.race([exitPromise, timeoutPromise]);
  } catch {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}

async function createWebFixture(projectRoot) {
  const cwd = await createWorkspaceFixture();
  const server = await startWebServer({ projectRoot, cwd });

  return {
    cwd,
    baseUrl: server.baseUrl,
    async cleanup() {
      await stopWebServer(server.child);
      await fs.rm(cwd, { recursive: true, force: true });
    },
  };
}

module.exports = {
  createWebFixture,
};
