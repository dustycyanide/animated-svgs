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

test("route aliases serve expected HTML pages", { timeout: 40000 }, async () => {
  const projectRoot = path.resolve(__dirname, "..");
  let server;

  try {
    server = await startWebServer({ projectRoot, cwd: projectRoot });

    const gridPaths = ["/", "/grid", "/library"];
    const generatePaths = ["/generate", "/workbench"];

    for (const routePath of gridPaths) {
      const response = await requestRaw({
        method: "GET",
        url: `http://127.0.0.1:${server.port}${routePath}`,
      });
      assert.equal(response.statusCode, 200);
      assert.match(String(response.headers["content-type"] || ""), /text\/html/i);
      assert.match(response.body, /Animated SVG Library/i);
    }

    for (const routePath of generatePaths) {
      const response = await requestRaw({
        method: "GET",
        url: `http://127.0.0.1:${server.port}${routePath}`,
      });
      assert.equal(response.statusCode, 200);
      assert.match(String(response.headers["content-type"] || ""), /text\/html/i);
      assert.match(response.body, /Animated SVG Workbench/i);
    }
  } finally {
    await stopWebServer(server ? server.child : null);
  }
});

test("API contracts keep status and payload semantics", { timeout: 50000 }, async () => {
  const projectRoot = path.resolve(__dirname, "..");
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "animated-svgs-web-contracts-"));
  const examplesDir = path.join(tmpRoot, "examples");
  let server;

  await fs.mkdir(examplesDir, { recursive: true });
  await fs.writeFile(
    path.join(examplesDir, "seed.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#22c55e" /></svg>\n',
    "utf8",
  );

  try {
    server = await startWebServer({ projectRoot, cwd: tmpRoot });
    const baseUrl = `http://127.0.0.1:${server.port}`;

    const prompts = await requestJson({ method: "GET", url: `${baseUrl}/api/prompts` });
    assert.equal(prompts.statusCode, 200);
    assert.equal(typeof prompts.payload.promptMode, "string");
    assert.ok(Array.isArray(prompts.payload.prompts));

    const nextPrompt = await requestJson({ method: "POST", url: `${baseUrl}/api/next-prompt`, body: {} });
    assert.equal(nextPrompt.statusCode, 200);
    assert.equal(typeof nextPrompt.payload.prompt, "string");

    const next = await requestJson({ method: "POST", url: `${baseUrl}/api/next`, body: {} });
    assert.equal(next.statusCode, 400);
    assert.match(next.payload.error, /Gemini API key missing/i);

    const polishTemplate = await requestJson({ method: "GET", url: `${baseUrl}/api/polish-template` });
    assert.equal(polishTemplate.statusCode, 200);
    assert.equal(typeof polishTemplate.payload.template, "string");
    assert.ok(Array.isArray(polishTemplate.payload.placeholders));

    const exportPresets = await requestJson({
      method: "GET",
      url: `${baseUrl}/api/discord-export/presets`,
    });
    assert.equal(exportPresets.statusCode, 200);
    assert.ok(Array.isArray(exportPresets.payload.presets));
    assert.ok(Array.isArray(exportPresets.payload.configPresets));

    const savePrompt = await requestJson({
      method: "POST",
      url: `${baseUrl}/api/save-prompt`,
      body: { prompt: "Contract test prompt" },
    });
    assert.equal(savePrompt.statusCode, 200);
    assert.equal(savePrompt.payload.ok, true);

    const generateMissing = await requestJson({
      method: "POST",
      url: `${baseUrl}/api/generate`,
      body: {},
    });
    assert.equal(generateMissing.statusCode, 400);
    assert.equal(generateMissing.payload.error, "Missing prompt.");

    const createMissing = await requestJson({
      method: "POST",
      url: `${baseUrl}/api/create-from-svg`,
      body: {},
    });
    assert.equal(createMissing.statusCode, 400);
    assert.equal(createMissing.payload.error, "Missing SVG markup.");

    const polishMissing = await requestJson({
      method: "POST",
      url: `${baseUrl}/api/polish-prompt`,
      body: {},
    });
    assert.equal(polishMissing.statusCode, 400);
    assert.equal(polishMissing.payload.error, "Missing prompt.");

    const exportMissing = await requestJson({
      method: "POST",
      url: `${baseUrl}/api/discord-export`,
      body: {},
    });
    assert.equal(exportMissing.statusCode, 400);
    assert.equal(exportMissing.payload.error, "Missing SVG markup.");

    const library = await requestJson({
      method: "GET",
      url: `${baseUrl}/api/library?scope=created`,
    });
    assert.equal(library.statusCode, 200);
    assert.equal(library.payload.scope, "created");
    assert.ok(Array.isArray(library.payload.items));
    assert.equal(library.payload.items.length, 1);

    const itemName = library.payload.items[0].name;

    const libraryItem = await requestJson({
      method: "GET",
      url: `${baseUrl}/api/library/item?scope=created&name=${encodeURIComponent(itemName)}`,
    });
    assert.equal(libraryItem.statusCode, 200);
    assert.equal(libraryItem.payload.name, itemName);
    assert.match(libraryItem.payload.svg, /<svg\b/i);

    const libraryFile = await requestRaw({
      method: "GET",
      url: `${baseUrl}/api/library/file?scope=created&name=${encodeURIComponent(itemName)}`,
    });
    assert.equal(libraryFile.statusCode, 200);
    assert.match(String(libraryFile.headers["content-type"] || ""), /image\/svg\+xml/i);

    const hide = await requestJson({
      method: "POST",
      url: `${baseUrl}/api/library/hide`,
      body: { name: itemName },
    });
    assert.equal(hide.statusCode, 200);
    assert.equal(hide.payload.ok, true);

    const unhide = await requestJson({
      method: "POST",
      url: `${baseUrl}/api/library/unhide`,
      body: { name: hide.payload.moved.name },
    });
    assert.equal(unhide.statusCode, 200);
    assert.equal(unhide.payload.ok, true);

    const deletedName = unhide.payload.moved.name;
    const remove = await requestJson({
      method: "POST",
      url: `${baseUrl}/api/library/delete`,
      body: { name: deletedName, scope: "created" },
    });
    assert.equal(remove.statusCode, 200);
    assert.equal(remove.payload.ok, true);

    const afterDelete = await requestJson({
      method: "GET",
      url: `${baseUrl}/api/library?scope=created`,
    });
    assert.equal(afterDelete.statusCode, 200);
    assert.equal(afterDelete.payload.items.length, 0);

    const missingNameResponse = await requestJson({
      method: "GET",
      url: `${baseUrl}/api/library/item?scope=created`,
    });
    assert.equal(missingNameResponse.statusCode, 400);
    assert.equal(missingNameResponse.payload.error, "Missing name.");

    const fileMissingName = await requestRaw({
      method: "GET",
      url: `${baseUrl}/api/library/file?scope=created`,
    });
    assert.equal(fileMissingName.statusCode, 400);
    assert.match(fileMissingName.body, /Missing name\./);

    const hideMissingName = await requestJson({
      method: "POST",
      url: `${baseUrl}/api/library/hide`,
      body: {},
    });
    assert.equal(hideMissingName.statusCode, 400);

    const unhideMissingName = await requestJson({
      method: "POST",
      url: `${baseUrl}/api/library/unhide`,
      body: {},
    });
    assert.equal(unhideMissingName.statusCode, 400);

    const deleteMissingName = await requestJson({
      method: "POST",
      url: `${baseUrl}/api/library/delete`,
      body: {},
    });
    assert.equal(deleteMissingName.statusCode, 400);
  } finally {
    await stopWebServer(server ? server.child : null);
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});
