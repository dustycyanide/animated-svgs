const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const DISCORD_EXPORT_PRESETS = Object.freeze({
  "attachment-webp": {
    id: "attachment-webp",
    label: "Chat Attachment (Animated WebP)",
    format: "webp",
    mimeType: "image/webp",
    extension: ".webp",
    sizeLimitBytes: 10 * 1024 * 1024,
    target: "source-fit",
    maxDimension: 1024,
    minimumDimension: 96,
    attemptsByConfig: {
      quality: [
        { fps: 24, durationSeconds: 5, quality: 82, scale: 1 },
        { fps: 20, durationSeconds: 4, quality: 74, scale: 0.88 },
        { fps: 16, durationSeconds: 3.5, quality: 66, scale: 0.78 },
        { fps: 12, durationSeconds: 2.5, quality: 56, scale: 0.68 },
      ],
      fast: [
        { fps: 14, durationSeconds: 2.4, quality: 68, scale: 0.76 },
        { fps: 10, durationSeconds: 1.8, quality: 58, scale: 0.64 },
      ],
    },
  },
  "emoji-webp": {
    id: "emoji-webp",
    label: "Server Emoji (Animated WebP)",
    format: "webp",
    mimeType: "image/webp",
    extension: ".webp",
    sizeLimitBytes: 256 * 1024,
    target: "fixed-square",
    size: 128,
    attemptsByConfig: {
      quality: [
        { fps: 20, durationSeconds: 3, quality: 82 },
        { fps: 16, durationSeconds: 2.5, quality: 72 },
        { fps: 12, durationSeconds: 2, quality: 62 },
        { fps: 10, durationSeconds: 1.6, quality: 54 },
      ],
      fast: [
        { fps: 12, durationSeconds: 2, quality: 70 },
        { fps: 10, durationSeconds: 1.6, quality: 60 },
      ],
    },
  },
  "emoji-gif": {
    id: "emoji-gif",
    label: "Server Emoji (GIF)",
    format: "gif",
    mimeType: "image/gif",
    extension: ".gif",
    sizeLimitBytes: 256 * 1024,
    target: "fixed-square",
    size: 128,
    attemptsByConfig: {
      quality: [
        { fps: 16, durationSeconds: 3 },
        { fps: 12, durationSeconds: 2.4 },
        { fps: 10, durationSeconds: 2 },
        { fps: 8, durationSeconds: 1.6 },
      ],
      fast: [
        { fps: 10, durationSeconds: 2 },
        { fps: 8, durationSeconds: 1.6 },
      ],
    },
  },
  "sticker-apng": {
    id: "sticker-apng",
    label: "Sticker (APNG)",
    format: "apng",
    mimeType: "image/png",
    extension: ".png",
    sizeLimitBytes: 512 * 1024,
    target: "fixed-square",
    size: 320,
    attemptsByConfig: {
      quality: [
        { fps: 20, durationSeconds: 3 },
        { fps: 16, durationSeconds: 2.5 },
        { fps: 12, durationSeconds: 2.1 },
        { fps: 10, durationSeconds: 1.6 },
      ],
      fast: [
        { fps: 12, durationSeconds: 2.2 },
        { fps: 10, durationSeconds: 1.8 },
      ],
    },
  },
});

const DISCORD_EXPORT_CONFIG_PRESETS = Object.freeze({
  quality: {
    id: "quality",
    label: "Quality",
    description: "Higher frame rate and duration. Slower export.",
  },
  fast: {
    id: "fast",
    label: "Fast",
    description: "Lower frame count and shorter duration. Faster export.",
  },
});

const DISCORD_EXPORT_PRESET_LIST = Object.values(DISCORD_EXPORT_PRESETS).map((preset) => ({
  id: preset.id,
  label: preset.label,
  format: preset.format,
  mimeType: preset.mimeType,
  extension: preset.extension,
  sizeLimitBytes: preset.sizeLimitBytes,
}));

const DISCORD_EXPORT_CONFIG_PRESET_LIST = Object.values(DISCORD_EXPORT_CONFIG_PRESETS).map((preset) => ({
  id: preset.id,
  label: preset.label,
  description: preset.description,
}));

const PNG_FRAME_PATTERN = "frame-%05d.png";

class DiscordExportError extends Error {
  constructor(message, statusCode = 422) {
    super(message);
    this.name = "DiscordExportError";
    this.statusCode = statusCode;
  }
}

function getDiscordExportPreset(presetId) {
  const normalizedId = String(presetId || "attachment-webp").trim().toLowerCase();
  const preset = DISCORD_EXPORT_PRESETS[normalizedId];
  if (!preset) {
    throw new DiscordExportError("Unsupported Discord export preset.", 400);
  }
  return preset;
}

function getDiscordExportConfigPreset(configPresetId) {
  const normalizedId = String(configPresetId || "quality").trim().toLowerCase();
  const preset = DISCORD_EXPORT_CONFIG_PRESETS[normalizedId];
  if (!preset) {
    throw new DiscordExportError("Unsupported Discord export configuration preset.", 400);
  }
  return preset;
}

function parseLengthValue(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(/^([+-]?\d+(?:\.\d+)?)(px)?$/i);
  if (!match) {
    return null;
  }
  const parsed = Number.parseFloat(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseViewBox(svg) {
  const viewBoxMatch = svg.match(/\bviewBox\s*=\s*['\"]([^'\"]+)['\"]/i);
  if (!viewBoxMatch) {
    return null;
  }
  const values = viewBoxMatch[1]
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number.parseFloat(part))
    .filter((part) => Number.isFinite(part));
  if (values.length !== 4) {
    return null;
  }
  const width = Math.abs(values[2]);
  const height = Math.abs(values[3]);
  if (width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

function parseSvgDimensions(svg) {
  if (typeof svg !== "string" || svg.trim().length === 0) {
    return { width: 512, height: 512, source: "fallback" };
  }

  const tagMatch = svg.match(/<svg\b[^>]*>/i);
  const tag = tagMatch ? tagMatch[0] : "";
  const widthMatch = tag.match(/\bwidth\s*=\s*['\"]([^'\"]+)['\"]/i);
  const heightMatch = tag.match(/\bheight\s*=\s*['\"]([^'\"]+)['\"]/i);
  const parsedWidth = parseLengthValue(widthMatch ? widthMatch[1] : null);
  const parsedHeight = parseLengthValue(heightMatch ? heightMatch[1] : null);

  if (parsedWidth && parsedHeight) {
    return {
      width: parsedWidth,
      height: parsedHeight,
      source: "attributes",
    };
  }

  const viewBox = parseViewBox(svg);
  if (viewBox) {
    return {
      ...viewBox,
      source: "viewBox",
    };
  }

  if (parsedWidth && !parsedHeight) {
    return { width: parsedWidth, height: parsedWidth, source: "width-only" };
  }
  if (parsedHeight && !parsedWidth) {
    return { width: parsedHeight, height: parsedHeight, source: "height-only" };
  }

  return { width: 512, height: 512, source: "fallback" };
}

function clampDimension(value, minSize = 1) {
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded) || rounded < minSize) {
    return minSize;
  }
  return rounded;
}

function resolveBaseTargetSize(preset, sourceDimensions) {
  if (preset.target === "fixed-square") {
    const size = clampDimension(preset.size, 1);
    return { width: size, height: size };
  }

  const width = Math.max(sourceDimensions.width, 1);
  const height = Math.max(sourceDimensions.height, 1);
  const maxDimension = Math.max(Number(preset.maxDimension) || 1024, 32);
  const minDimension = Math.max(Number(preset.minimumDimension) || 96, 32);

  const sourceMax = Math.max(width, height);
  const scale = sourceMax > maxDimension ? maxDimension / sourceMax : 1;
  const scaledWidth = clampDimension(width * scale, minDimension);
  const scaledHeight = clampDimension(height * scale, minDimension);
  return { width: scaledWidth, height: scaledHeight };
}

function sanitizeFileStem(input) {
  const cleaned = String(input || "discord-export")
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");

  if (!cleaned) {
    return "discord-export";
  }
  return cleaned.slice(0, 64);
}

async function ensureFfmpegAvailable() {
  await runCommand("ffmpeg", ["-version"], "ffmpeg is required for Discord export. Install ffmpeg and retry.");
}

async function runCommand(command, args, errorMessage) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      if (error && error.code === "ENOENT") {
        reject(new DiscordExportError(errorMessage, 422));
        return;
      }
      reject(new DiscordExportError(error.message || errorMessage, 500));
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const detail = stderr.trim();
      const combined = detail ? `${errorMessage}\n${detail}` : errorMessage;
      reject(new DiscordExportError(combined, 422));
    });
  });
}

async function loadPuppeteerCore() {
  try {
    return require("puppeteer-core");
  } catch {
    throw new DiscordExportError(
      "puppeteer-core is required for Discord export. Run npm install and retry.",
      500,
    );
  }
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveChromeExecutable() {
  const fromEnv = [process.env.DISCORD_EXPORT_CHROME, process.env.PUPPETEER_EXECUTABLE_PATH]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find(Boolean);

  if (fromEnv) {
    return fromEnv;
  }

  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];

  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  throw new DiscordExportError(
    "No Chrome/Chromium executable found. Set DISCORD_EXPORT_CHROME to a browser path.",
    422,
  );
}

async function openSvgRenderer(svg) {
  const puppeteer = await loadPuppeteerCore();
  const executablePath = await resolveChromeExecutable();

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const page = await browser.newPage();
  await page.setContent(
    "<!doctype html><html><head><meta charset='utf-8'></head><body style='margin:0;padding:0;overflow:hidden;background:transparent;'><div id='stage' style='width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;'></div></body></html>",
    { waitUntil: "domcontentloaded" },
  );

  await page.evaluate((svgMarkup) => {
    const stage = document.getElementById("stage");
    if (!stage) {
      throw new Error("Missing export stage.");
    }
    stage.innerHTML = svgMarkup;
    const svg = stage.querySelector("svg");
    if (!svg) {
      throw new Error("SVG markup is missing a root <svg> element.");
    }

    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    if (!svg.getAttribute("preserveAspectRatio")) {
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    }
    if (typeof svg.pauseAnimations === "function") {
      svg.pauseAnimations();
    }
  }, svg);

  return { browser, page };
}

async function renderFrames({ page, width, height, fps, durationSeconds, framesDir }) {
  await page.setViewport({
    width,
    height,
    deviceScaleFactor: 1,
  });

  await page.evaluate((targetWidth, targetHeight) => {
    const stage = document.getElementById("stage");
    if (!stage) {
      return;
    }
    stage.style.width = `${targetWidth}px`;
    stage.style.height = `${targetHeight}px`;
  }, width, height);

  await fs.mkdir(framesDir, { recursive: true });

  const frameCount = Math.max(2, Math.round(fps * durationSeconds));

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const currentTimeSeconds = frameIndex / fps;
    // eslint-disable-next-line no-await-in-loop
    await page.evaluate((seconds) => {
      const svg = document.querySelector("#stage svg");
      if (svg && typeof svg.pauseAnimations === "function") {
        svg.pauseAnimations();
      }
      if (svg && typeof svg.setCurrentTime === "function") {
        try {
          svg.setCurrentTime(seconds);
        } catch {
          // Ignore SMIL seek failures and continue with available animations.
        }
      }

      if (typeof document.getAnimations === "function") {
        const animations = document.getAnimations({ subtree: true });
        for (const animation of animations) {
          try {
            animation.pause();
            animation.currentTime = seconds * 1000;
          } catch {
            // Ignore unsupported animations.
          }
        }
      }
    }, currentTimeSeconds);

    // eslint-disable-next-line no-await-in-loop
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));

    const framePath = path.join(framesDir, `frame-${String(frameIndex).padStart(5, "0")}.png`);
    // eslint-disable-next-line no-await-in-loop
    await page.screenshot({
      path: framePath,
      omitBackground: true,
      clip: { x: 0, y: 0, width, height },
      type: "png",
    });
  }
}

function resolveScaledDimensions(baseSize, attempt) {
  const scale = Number.isFinite(attempt.scale) && attempt.scale > 0 ? attempt.scale : 1;
  return {
    width: clampDimension(baseSize.width * scale, 1),
    height: clampDimension(baseSize.height * scale, 1),
  };
}

function buildWebpArgs({ framesDir, outputPath, fps, width, height, quality }) {
  return [
    "-y",
    "-framerate",
    String(fps),
    "-start_number",
    "0",
    "-i",
    path.join(framesDir, PNG_FRAME_PATTERN),
    "-vf",
    `scale=${width}:${height}:flags=lanczos:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
    "-an",
    "-c:v",
    "libwebp",
    "-lossless",
    "0",
    "-q:v",
    String(quality),
    "-compression_level",
    "6",
    "-preset",
    "drawing",
    "-loop",
    "0",
    "-pix_fmt",
    "yuva420p",
    outputPath,
  ];
}

function buildGifArgs({ framesDir, outputPath, fps, width, height }) {
  return [
    "-y",
    "-framerate",
    String(fps),
    "-start_number",
    "0",
    "-i",
    path.join(framesDir, PNG_FRAME_PATTERN),
    "-vf",
    `fps=${fps},scale=${width}:${height}:flags=lanczos:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,split[s0][s1];[s0]palettegen=reserve_transparent=on[p];[s1][p]paletteuse=dither=sierra2_4a`,
    "-loop",
    "0",
    outputPath,
  ];
}

function buildApngArgs({ framesDir, outputPath, fps, width, height }) {
  return [
    "-y",
    "-framerate",
    String(fps),
    "-start_number",
    "0",
    "-i",
    path.join(framesDir, PNG_FRAME_PATTERN),
    "-vf",
    `scale=${width}:${height}:flags=lanczos:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
    "-plays",
    "0",
    "-f",
    "apng",
    outputPath,
  ];
}

function resolveEncoderArgs({ preset, framesDir, outputPath, fps, width, height, quality }) {
  if (preset.format === "webp") {
    return buildWebpArgs({ framesDir, outputPath, fps, width, height, quality });
  }
  if (preset.format === "gif") {
    return buildGifArgs({ framesDir, outputPath, fps, width, height });
  }
  return buildApngArgs({ framesDir, outputPath, fps, width, height });
}

function resolveExportAttemptsForConfig(preset, configPreset) {
  const attemptsByConfig = preset && typeof preset.attemptsByConfig === "object"
    ? preset.attemptsByConfig
    : null;

  if (attemptsByConfig && Array.isArray(attemptsByConfig[configPreset.id]) && attemptsByConfig[configPreset.id].length > 0) {
    return attemptsByConfig[configPreset.id];
  }

  if (attemptsByConfig && Array.isArray(attemptsByConfig.quality) && attemptsByConfig.quality.length > 0) {
    return attemptsByConfig.quality;
  }

  if (Array.isArray(preset?.attempts) && preset.attempts.length > 0) {
    return preset.attempts;
  }

  return [{ fps: 16, durationSeconds: 2 }];
}

function buildPresetSummary(preset) {
  return {
    id: preset.id,
    label: preset.label,
    format: preset.format,
    mimeType: preset.mimeType,
    extension: preset.extension,
    sizeLimitBytes: preset.sizeLimitBytes,
  };
}

function buildConfigPresetSummary(preset) {
  return {
    id: preset.id,
    label: preset.label,
    description: preset.description,
  };
}

async function exportDiscordAsset({
  svg,
  presetId,
  configPresetId,
  sourceName = "discord-export.svg",
}) {
  const svgText = typeof svg === "string" ? svg.trim() : "";
  if (!svgText) {
    throw new DiscordExportError("Missing SVG markup for Discord export.", 400);
  }

  const preset = getDiscordExportPreset(presetId);
  const configPreset = getDiscordExportConfigPreset(configPresetId);
  await ensureFfmpegAvailable();

  const sourceDimensions = parseSvgDimensions(svgText);
  const baseSize = resolveBaseTargetSize(preset, sourceDimensions);
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "animated-svgs-discord-export-"));

  let browser = null;
  let page = null;

  try {
    const renderer = await openSvgRenderer(svgText);
    browser = renderer.browser;
    page = renderer.page;

    const attempts = resolveExportAttemptsForConfig(preset, configPreset);

    let bestAttempt = null;

    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      const attemptDir = path.join(workspaceDir, `attempt-${index + 1}`);
      const framesDir = path.join(attemptDir, "frames");
      await fs.mkdir(framesDir, { recursive: true });

      const size = resolveScaledDimensions(baseSize, attempt);
      const fps = Math.max(2, clampDimension(attempt.fps || 12, 2));
      const durationSeconds = Math.max(0.5, Number(attempt.durationSeconds) || 2);
      const quality = Math.max(10, Math.min(100, clampDimension(attempt.quality || 72, 10)));

      // eslint-disable-next-line no-await-in-loop
      await renderFrames({
        page,
        width: size.width,
        height: size.height,
        fps,
        durationSeconds,
        framesDir,
      });

      const outputPath = path.join(attemptDir, `export${preset.extension}`);
      const ffmpegArgs = resolveEncoderArgs({
        preset,
        framesDir,
        outputPath,
        fps,
        width: size.width,
        height: size.height,
        quality,
      });

      // eslint-disable-next-line no-await-in-loop
      await runCommand(
        "ffmpeg",
        ffmpegArgs,
        `ffmpeg failed while encoding ${preset.label}.`,
      );

      // eslint-disable-next-line no-await-in-loop
      const buffer = await fs.readFile(outputPath);
      const attemptResult = {
        buffer,
        bytes: buffer.byteLength,
        width: size.width,
        height: size.height,
        fps,
        durationSeconds,
      };

      if (!bestAttempt || attemptResult.bytes < bestAttempt.bytes) {
        bestAttempt = attemptResult;
      }

      if (attemptResult.bytes <= preset.sizeLimitBytes) {
        bestAttempt = attemptResult;
        break;
      }
    }

    if (!bestAttempt) {
      throw new DiscordExportError("Discord export failed: no output produced.", 500);
    }

    const sourceStem = sanitizeFileStem(sourceName);
    const fileName = `${sourceStem}-${preset.id}${preset.extension}`;
    const exceedsLimit = bestAttempt.bytes > preset.sizeLimitBytes;
    const warning = exceedsLimit
      ? `Export is ${bestAttempt.bytes} bytes; Discord preset limit is ${preset.sizeLimitBytes} bytes.`
      : null;

    return {
      preset: buildPresetSummary(preset),
      configPreset: buildConfigPresetSummary(configPreset),
      output: {
        fileName,
        bytes: bestAttempt.bytes,
        width: bestAttempt.width,
        height: bestAttempt.height,
        fps: bestAttempt.fps,
        durationSeconds: bestAttempt.durationSeconds,
        mimeType: preset.mimeType,
        format: preset.format,
        meetsDiscordLimit: !exceedsLimit,
        warning,
        buffer: bestAttempt.buffer,
      },
    };
  } finally {
    await Promise.allSettled([
      page ? page.close() : Promise.resolve(),
      browser ? browser.close() : Promise.resolve(),
    ]);
    await fs.rm(workspaceDir, { recursive: true, force: true });
  }
}

module.exports = {
  DISCORD_EXPORT_CONFIG_PRESET_LIST,
  DISCORD_EXPORT_PRESET_LIST,
  DiscordExportError,
  exportDiscordAsset,
  getDiscordExportConfigPreset,
  getDiscordExportPreset,
  parseSvgDimensions,
};
