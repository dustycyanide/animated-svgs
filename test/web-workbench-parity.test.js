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

async function requestRaw({ method, url, body = null }) {
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
          resolve({
            statusCode: response.statusCode || 0,
            headers: response.headers,
            body: raw,
          });
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

async function requestJson(input) {
  const response = await requestRaw(input);
  return {
    ...response,
    payload: response.body.trim() ? JSON.parse(response.body) : {},
  };
}

async function waitForServer(url, child, { timeoutMs = 20000 } = {}) {
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
    await sleep(150);
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
    port,
  };
}

async function stopWebServer(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  const exitPromise = once(child, "exit");
  const timeoutPromise = sleep(8000).then(() => {
    throw new Error("Timed out stopping web server.");
  });

  try {
    await Promise.race([exitPromise, timeoutPromise]);
  } catch {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}

test("workbench aliases render expected generation and library controls", { timeout: 40000 }, async () => {
  const projectRoot = path.resolve(__dirname, "..");
  let server;

  try {
    server = await startWebServer({ projectRoot, cwd: projectRoot });

    for (const routePath of ["/generate", "/workbench"]) {
      const response = await requestRaw({
        method: "GET",
        url: `http://127.0.0.1:${server.port}${routePath}`,
      });

      assert.equal(response.statusCode, 200);
      assert.match(String(response.headers["content-type"] || ""), /text\/html/i);
      assert.match(response.body, /Animated SVG Workbench/i);
      assert.match(response.body, /id="generation-mode-select"/);
      assert.match(response.body, /id="prompt-select"/);
      assert.match(response.body, /id="next-btn"/);
      assert.match(response.body, /id="parallel-btn"/);
      assert.match(response.body, /id="custom-prompt-input"/);
      assert.match(response.body, /id="polish-btn"/);
      assert.match(response.body, /id="generate-custom-btn"/);
      assert.match(response.body, /id="paste-svg-input"/);
      assert.match(response.body, /id="create-from-svg-btn"/);
      assert.match(response.body, /id="model-input"/);
      assert.match(response.body, /id="max-tokens-input"/);
      assert.match(response.body, /id="reasoning-level-select"/);
      assert.match(response.body, /id="polish-template-input"/);
      assert.match(response.body, /id="svg-viewer"/);
      assert.match(response.body, /id="library-list"/);
      assert.match(response.body, /id="show-hidden-toggle"/);
      assert.match(response.body, /id="discord-export-btn"/);
      assert.match(response.body, /href="\/styles\.css"/);
      assert.match(response.body, /import\("\/app\.js"\)/);
    }
  } finally {
    await stopWebServer(server ? server.child : null);
  }
});

test("workbench generation and library APIs keep expected semantics", { timeout: 50000 }, async () => {
  const projectRoot = path.resolve(__dirname, "..");
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "animated-svgs-workbench-parity-"));
  let server;

  try {
    server = await startWebServer({ projectRoot, cwd: tmpRoot });
    const baseUrl = `http://127.0.0.1:${server.port}`;

    const prompts = await requestJson({ method: "GET", url: `${baseUrl}/api/prompts` });
    assert.equal(prompts.statusCode, 200);
    assert.equal(typeof prompts.payload.promptMode, "string");
    assert.ok(Array.isArray(prompts.payload.prompts));

    const polishTemplate = await requestJson({
      method: "GET",
      url: `${baseUrl}/api/polish-template`,
    });
    assert.equal(polishTemplate.statusCode, 200);
    assert.equal(typeof polishTemplate.payload.template, "string");
    assert.ok(Array.isArray(polishTemplate.payload.placeholders));

    const createFromSvg = await requestJson({
      method: "POST",
      url: `${baseUrl}/api/create-from-svg`,
      body: {
        prompt: "Workbench parity import",
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#34d399" /></svg>',
      },
    });
    assert.equal(createFromSvg.statusCode, 200);
    assert.equal(createFromSvg.payload.promptMode, "pasted-svg");
    assert.equal(typeof createFromSvg.payload.savedAsset?.name, "string");

    const createdLibrary = await requestJson({
      method: "GET",
      url: `${baseUrl}/api/library?scope=created`,
    });
    assert.equal(createdLibrary.statusCode, 200);
    assert.equal(createdLibrary.payload.scope, "created");
    assert.equal(createdLibrary.payload.items.length, 1);
  } finally {
    await stopWebServer(server ? server.child : null);
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});
