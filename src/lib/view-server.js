const fs = require("fs/promises");
const fscore = require("fs");
const path = require("path");
const http = require("http");
const { generateDashboard } = require("./dashboard");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};

function safePathJoin(rootDir, unsafePath) {
  const cleaned = unsafePath.split("?")[0].split("#")[0];
  const decoded = decodeURIComponent(cleaned);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(rootDir, normalized);
  if (!fullPath.startsWith(rootDir)) {
    return null;
  }
  return fullPath;
}

async function serveFile(filePath, response) {
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      response.statusCode = 403;
      response.end("Forbidden");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.setHeader("Content-Type", MIME_TYPES[extension] || "application/octet-stream");
    const stream = fscore.createReadStream(filePath);
    stream.on("error", () => {
      response.statusCode = 500;
      response.end("Failed to read file.");
    });
    stream.pipe(response);
  } catch {
    response.statusCode = 404;
    response.end("Not found");
  }
}

async function startViewServer({ dir, port, title }) {
  const rootDir = path.resolve(process.cwd(), dir || "runs-lab");
  await fs.mkdir(rootDir, { recursive: true });

  const server = http.createServer(async (request, response) => {
    try {
      const urlPath = request.url || "/";

      if (urlPath === "/" || urlPath.startsWith("/index.html")) {
        await generateDashboard({ outDir: rootDir, title });
        await serveFile(path.join(rootDir, "index.html"), response);
        return;
      }

      const targetPath = safePathJoin(rootDir, urlPath);
      if (!targetPath) {
        response.statusCode = 400;
        response.end("Bad request");
        return;
      }

      await serveFile(targetPath, response);
    } catch (error) {
      response.statusCode = 500;
      response.end(`Server error: ${error.message}`);
    }
  });

  await new Promise((resolve) => {
    server.listen(port, resolve);
  });

  return {
    server,
    rootDir,
    port: server.address().port,
  };
}

module.exports = {
  startViewServer,
};
