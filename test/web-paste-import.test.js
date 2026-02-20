const test = require("node:test");
const assert = require("node:assert/strict");
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

async function requestJson({ method, url, body = null }) {
  const target = new URL(url);
  const rawBody = body ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: target.hostname,
        port: Number(target.port),
        path: `${target.pathname}${target.search}`,
        method,
        headers: rawBody
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(rawBody),
            }
          : undefined,
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          try {
            const payload = raw.trim() ? JSON.parse(raw) : {};
            resolve({
              statusCode: response.statusCode || 0,
              payload,
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.on("error", reject);
    if (rawBody) {
      request.write(rawBody);
    }
    request.end();
  });
}

async function waitForServer(url, child, { timeoutMs = 20000 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Web server exited early with code ${child.exitCode}.`);
    }
    try {
      const response = await requestJson({ method: "GET", url });
      if (response.statusCode >= 200 && response.statusCode < 500) {
        return;
      }
    } catch {
      // Keep polling.
    }
    await sleep(120);
  }
  throw new Error("Timed out waiting for web server startup.");
}

async function startWebServer({ projectRoot, cwd }) {
  const port = await getFreePort();
  const serverScript = path.join(projectRoot, "src", "web-server.js");
  const child = spawn(process.execPath, [serverScript], {
    cwd,
    env: {
      ...process.env,
      WEB_PORT: String(port),
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
    port,
  };
}

async function stopWebServer(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  const exitPromise = once(child, "exit");
  const timeoutPromise = sleep(4000).then(() => {
    throw new Error("Timed out stopping web server.");
  });

  try {
    await Promise.race([exitPromise, timeoutPromise]);
  } catch {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}

test(
  "paste SVG endpoint imports markup, sanitizes unsafe content, and saves to created library",
  { timeout: 30000 },
  async () => {
    const projectRoot = path.resolve(__dirname, "..");
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "animated-svgs-web-paste-"));
    let server;

    try {
      server = await startWebServer({ projectRoot, cwd: tmpRoot });

      const importResponse = await requestJson({
        method: "POST",
        url: `http://127.0.0.1:${server.port}/api/create-from-svg`,
        body: {
          prompt: "Imported test svg",
          svg: [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">',
            "<script>alert('x')</script>",
            '<rect width="24" height="24" fill="#0ea5e9" onclick="alert(1)" />',
            "</svg>",
          ].join(""),
        },
      });

      assert.equal(importResponse.statusCode, 200);
      assert.equal(importResponse.payload.promptMode, "pasted-svg");
      assert.equal(importResponse.payload.model, "local-paste");
      assert.equal(importResponse.payload.prompt, "Imported test svg");
      assert.ok(importResponse.payload.savedAsset?.name);
      assert.match(importResponse.payload.savedAsset.name, /\.svg$/);
      assert.ok(Array.isArray(importResponse.payload.preprocessNotes));
      assert.ok(importResponse.payload.preprocessNotes.length >= 1);
      assert.doesNotMatch(importResponse.payload.svg, /<script\b/i);
      assert.doesNotMatch(importResponse.payload.svg, /\sonclick\s*=/i);

      const libraryResponse = await requestJson({
        method: "GET",
        url: `http://127.0.0.1:${server.port}/api/library?scope=created`,
      });
      assert.equal(libraryResponse.statusCode, 200);
      assert.equal(libraryResponse.payload.scope, "created");
      assert.equal(libraryResponse.payload.items.length, 1);
      assert.equal(libraryResponse.payload.items[0].prompt, "Imported test svg");
    } finally {
      await stopWebServer(server ? server.child : null);
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  },
);
