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

async function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
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
    });
    request.on("error", reject);
  });
}

async function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const rawBody = `${JSON.stringify(body || {})}`;
    const request = http.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(rawBody),
        },
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
    request.write(rawBody);
    request.end();
  });
}

async function waitForServer(url, child, { timeoutMs = 10000 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Web server exited early with code ${child.exitCode}.`);
    }
    try {
      const response = await getJson(url);
      if (response.statusCode >= 200 && response.statusCode < 500) {
        return;
      }
    } catch {
      // keep polling
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

async function listCreatedLibrary(port) {
  const { statusCode, payload } = await getJson(
    `http://127.0.0.1:${port}/api/library?scope=created`,
  );
  assert.equal(statusCode, 200);
  return payload;
}

test(
  "library delete endpoint removes the SVG and metadata",
  { timeout: 30000 },
  async () => {
    const projectRoot = path.resolve(__dirname, "..");
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "animated-svgs-web-delete-"));
    const examplesDir = path.join(tmpRoot, "examples");
    const createdDir = path.join(tmpRoot, "results", "web-created");
    let server;

    await fs.mkdir(examplesDir, { recursive: true });
    await fs.writeFile(
      path.join(examplesDir, "delete-me.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#ef4444" /></svg>\n',
      "utf8",
    );

    try {
      server = await startWebServer({ projectRoot, cwd: tmpRoot });
      const initial = await listCreatedLibrary(server.port);
      assert.equal(initial.items.length, 1);
      const target = initial.items[0];
      assert.equal(typeof target.name, "string");

      const deleteResponse = await postJson(`http://127.0.0.1:${server.port}/api/library/delete`, {
        name: target.name,
        scope: "created",
      });
      assert.equal(deleteResponse.statusCode, 200);
      assert.equal(deleteResponse.payload.ok, true);
      assert.equal(deleteResponse.payload.deleted.name, target.name);
      assert.equal(deleteResponse.payload.deleted.scope, "created");

      const afterDelete = await listCreatedLibrary(server.port);
      assert.equal(afterDelete.items.length, 0);

      await assert.rejects(fs.access(path.join(createdDir, target.name)));
      await assert.rejects(
        fs.access(path.join(createdDir, `${path.basename(target.name, ".svg")}.json`)),
      );

      const deleteMissing = await postJson(`http://127.0.0.1:${server.port}/api/library/delete`, {
        name: target.name,
        scope: "created",
      });
      assert.equal(deleteMissing.statusCode, 404);
    } finally {
      await stopWebServer(server ? server.child : null);
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  },
);

test(
  "web starter examples are seeded once and are not restored after deletion",
  { timeout: 30000 },
  async () => {
    const projectRoot = path.resolve(__dirname, "..");
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "animated-svgs-web-seed-"));
    const examplesDir = path.join(tmpRoot, "examples");
    const createdDir = path.join(tmpRoot, "results", "web-created");
    const markerPath = path.join(tmpRoot, "results", ".web-library-seeded.json");

    await fs.mkdir(examplesDir, { recursive: true });
    await fs.writeFile(
      path.join(examplesDir, "alpha.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#0ea5e9" /></svg>\n',
      "utf8",
    );
    await fs.writeFile(
      path.join(examplesDir, "beta.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#34d399" /></svg>\n',
      "utf8",
    );
    await fs.writeFile(
      path.join(examplesDir, "gamma.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><polygon points="16,3 29,29 3,29" fill="#f59e0b" /></svg>\n',
      "utf8",
    );

    let firstServer;
    let secondServer;
    let thirdServer;

    try {
      firstServer = await startWebServer({ projectRoot, cwd: tmpRoot });
      const firstLoad = await listCreatedLibrary(firstServer.port);
      assert.equal(firstLoad.scope, "created");
      assert.equal(firstLoad.items.length, 3);
      await fs.access(markerPath);
      const firstNames = firstLoad.items.map((item) => item.name).sort();
      await stopWebServer(firstServer.child);
      firstServer = null;

      secondServer = await startWebServer({ projectRoot, cwd: tmpRoot });
      const secondLoad = await listCreatedLibrary(secondServer.port);
      assert.equal(secondLoad.items.length, 3);
      const secondNames = secondLoad.items.map((item) => item.name).sort();
      assert.deepEqual(secondNames, firstNames);
      await stopWebServer(secondServer.child);
      secondServer = null;

      await fs.rm(createdDir, { recursive: true, force: true });
      await fs.mkdir(createdDir, { recursive: true });

      thirdServer = await startWebServer({ projectRoot, cwd: tmpRoot });
      const thirdLoad = await listCreatedLibrary(thirdServer.port);
      assert.equal(thirdLoad.items.length, 0);
      await fs.access(markerPath);
    } finally {
      await stopWebServer(firstServer ? firstServer.child : null);
      await stopWebServer(secondServer ? secondServer.child : null);
      await stopWebServer(thirdServer ? thirdServer.child : null);
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  },
);
