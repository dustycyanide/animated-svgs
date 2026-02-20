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

test("grid aliases render the React grid shell with required action and detail hooks", { timeout: 40000 }, async () => {
  const projectRoot = path.resolve(__dirname, "..");
  let server;

  try {
    server = await startWebServer({ projectRoot, cwd: projectRoot });

    for (const routePath of ["/", "/grid", "/library"]) {
      const response = await requestRaw({
        method: "GET",
        url: `http://127.0.0.1:${server.port}${routePath}`,
      });

      assert.equal(response.statusCode, 200);
      assert.match(String(response.headers["content-type"] || ""), /text\/html/i);
      assert.match(response.body, /Animated SVG Library/i);
      assert.match(response.body, /id="refresh-grid-btn"/);
      assert.match(response.body, /id="include-hidden-toggle"/);
      assert.match(response.body, /id="svg-grid"/);
      assert.match(response.body, /id="svg-detail-panel"/);
      assert.match(response.body, /id="detail-back-btn"/);
      assert.match(response.body, /id="detail-copy-btn"/);
      assert.match(response.body, /id="detail-viewer"/);
      assert.match(response.body, /id="detail-discord-export-btn"/);
      assert.match(response.body, /id="detail-download-link"/);
      assert.match(response.body, /id="detail-raw-link"/);
      assert.match(response.body, /id="detail-viewer-stage"/);
      assert.match(response.body, /id="detail-empty"/);
      assert.match(response.body, /href="\/grid\.css"/);
      assert.match(response.body, /import\("\/grid\.js"\)/);
    }
  } finally {
    await stopWebServer(server ? server.child : null);
  }
});

test("grid detail preview and action endpoints preserve expected behavior", { timeout: 50000 }, async () => {
  const projectRoot = path.resolve(__dirname, "..");
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "animated-svgs-grid-parity-"));
  const examplesDir = path.join(tmpRoot, "examples");
  let server;

  await fs.mkdir(examplesDir, { recursive: true });
  await fs.writeFile(
    path.join(examplesDir, "detail.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#38bdf8" /></svg>\n',
    "utf8",
  );

  try {
    server = await startWebServer({ projectRoot, cwd: tmpRoot });
    const baseUrl = `http://127.0.0.1:${server.port}`;

    const createdBefore = await requestJson({
      method: "GET",
      url: `${baseUrl}/api/library?scope=created`,
    });
    assert.equal(createdBefore.statusCode, 200);
    assert.equal(createdBefore.payload.scope, "created");
    assert.equal(createdBefore.payload.items.length, 1);
    assert.equal(createdBefore.payload.items[0].scope, "created");

    const itemName = createdBefore.payload.items[0].name;
    const detailItem = await requestJson({
      method: "GET",
      url: `${baseUrl}/api/library/item?scope=created&name=${encodeURIComponent(itemName)}`,
    });
    assert.equal(detailItem.statusCode, 200);
    assert.equal(detailItem.payload.name, itemName);
    assert.equal(detailItem.payload.scope, "created");
    assert.equal(typeof detailItem.payload.meta?.createdAt, "string");
    assert.match(detailItem.payload.svg, /<svg\b/i);

    const hideResponse = await requestJson({
      method: "POST",
      url: `${baseUrl}/api/library/hide`,
      body: { name: itemName },
    });
    assert.equal(hideResponse.statusCode, 200);
    assert.equal(hideResponse.payload.ok, true);
    assert.equal(hideResponse.payload.moved.scope, "archived");

    const createdAfterHide = await requestJson({
      method: "GET",
      url: `${baseUrl}/api/library?scope=created`,
    });
    assert.equal(createdAfterHide.statusCode, 200);
    assert.equal(createdAfterHide.payload.items.length, 0);

    const archivedAfterHide = await requestJson({
      method: "GET",
      url: `${baseUrl}/api/library?scope=archived`,
    });
    assert.equal(archivedAfterHide.statusCode, 200);
    assert.equal(archivedAfterHide.payload.items.length, 1);

    const unhideResponse = await requestJson({
      method: "POST",
      url: `${baseUrl}/api/library/unhide`,
      body: { name: hideResponse.payload.moved.name },
    });
    assert.equal(unhideResponse.statusCode, 200);
    assert.equal(unhideResponse.payload.ok, true);
    assert.equal(unhideResponse.payload.moved.scope, "created");

    const createdAfterUnhide = await requestJson({
      method: "GET",
      url: `${baseUrl}/api/library?scope=created`,
    });
    assert.equal(createdAfterUnhide.statusCode, 200);
    assert.equal(createdAfterUnhide.payload.items.length, 1);
  } finally {
    await stopWebServer(server ? server.child : null);
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});
