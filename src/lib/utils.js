const fs = require("fs/promises");
const path = require("path");

function slugify(input) {
  return String(input || "run")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 50);
}

function timestampId() {
  return new Date().toISOString().replace(/[.:]/g, "-");
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function parseNumber(input, fallback) {
  const value = Number(input);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

function parseArgs(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      result._.push(token);
      continue;
    }

    const tokenBody = token.slice(2);
    if (tokenBody.startsWith("no-")) {
      result[tokenBody.slice(3)] = false;
      continue;
    }

    const eqIndex = tokenBody.indexOf("=");
    if (eqIndex >= 0) {
      const key = tokenBody.slice(0, eqIndex);
      const value = tokenBody.slice(eqIndex + 1);
      result[key] = value;
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      result[tokenBody] = next;
      index += 1;
      continue;
    }

    result[tokenBody] = true;
  }

  return result;
}

function parseDimensions(svg) {
  const rootMatch = svg.match(/<svg\b([^>]*)>/i);
  if (!rootMatch) {
    return { width: 1024, height: 1024 };
  }
  const attrs = rootMatch[1];

  const widthMatch = attrs.match(/\bwidth\s*=\s*["']([^"']+)["']/i);
  const heightMatch = attrs.match(/\bheight\s*=\s*["']([^"']+)["']/i);
  const viewBoxMatch = attrs.match(/\bviewBox\s*=\s*["']([^"']+)["']/i);

  const width = widthMatch ? parseNumber(widthMatch[1].replace("px", ""), NaN) : NaN;
  const height = heightMatch
    ? parseNumber(heightMatch[1].replace("px", ""), NaN)
    : NaN;

  if (Number.isFinite(width) && Number.isFinite(height)) {
    return { width: Math.round(width), height: Math.round(height) };
  }

  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      return { width: Math.round(parts[2]), height: Math.round(parts[3]) };
    }
  }

  return { width: 1024, height: 1024 };
}

async function readPrompt({ prompt, promptFile }) {
  if (prompt && String(prompt).trim().length > 0) {
    return String(prompt).trim();
  }
  if (promptFile) {
    const absolutePath = path.resolve(process.cwd(), String(promptFile));
    const fileText = await fs.readFile(absolutePath, "utf8");
    if (fileText.trim().length === 0) {
      throw new Error(`Prompt file is empty: ${absolutePath}`);
    }
    return fileText.trim();
  }
  throw new Error("Provide --prompt or --prompt-file.");
}

module.exports = {
  slugify,
  timestampId,
  ensureDir,
  parseArgs,
  parseDimensions,
  parseNumber,
  readPrompt,
};
