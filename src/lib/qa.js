const fs = require("fs/promises");
const path = require("path");
const { XMLParser, XMLValidator } = require("fast-xml-parser");
const { PNG } = require("pngjs");
const { parseDimensions } = require("./utils");

function countElements(svg) {
  const matches = svg.match(/<([a-zA-Z][a-zA-Z0-9:_-]*)\b/g);
  return matches ? matches.length : 0;
}

function hasAnimation(svg) {
  const smil = /<(animate|animateTransform|animateMotion|set)\b/i.test(svg);
  const css = /@keyframes\b|animation\s*:/i.test(svg);
  return { smil, css, any: smil || css };
}

function detectUnsafePatterns(svg) {
  const findings = [];
  if (/<script\b/i.test(svg)) {
    findings.push("Contains <script>.");
  }
  if (/\son[a-z0-9_-]+\s*=/i.test(svg)) {
    findings.push("Contains inline event handlers.");
  }
  if (/javascript:/i.test(svg)) {
    findings.push("Contains javascript: URL usage.");
  }
  return findings;
}

function structuralChecks(svg) {
  const checks = {
    hasSvgRoot: /<svg\b[\s\S]*<\/svg>/i.test(svg),
    xmlValid: false,
    parseError: null,
  };

  const validation = XMLValidator.validate(svg);
  if (validation === true) {
    checks.xmlValid = true;
  } else {
    checks.parseError = validation?.err?.msg || "Unknown XML parse error.";
  }

  return checks;
}

function computeScore({ structural, animation, unsafeFindings, motionResult, elementCount }) {
  let score = 100;

  if (!structural.hasSvgRoot) {
    score -= 40;
  }
  if (!structural.xmlValid) {
    score -= 35;
  }
  if (!animation.any) {
    score -= 45;
  }
  if (unsafeFindings.length > 0) {
    score -= 25;
  }
  if (elementCount > 2000) {
    score -= 15;
  } else if (elementCount > 1200) {
    score -= 8;
  }

  if (motionResult?.status === "ok" && !motionResult.motionDetected) {
    score -= 20;
  }

  if (score < 0) {
    score = 0;
  }
  if (score > 100) {
    score = 100;
  }

  if (score >= 90) {
    return { score, grade: "A" };
  }
  if (score >= 80) {
    return { score, grade: "B" };
  }
  if (score >= 70) {
    return { score, grade: "C" };
  }
  if (score >= 60) {
    return { score, grade: "D" };
  }
  return { score, grade: "F" };
}

async function renderMotionCheck(svg, options) {
  const label = options.label || "svg";
  const delayMs = options.delayMs ?? 1200;
  const threshold = options.motionThreshold ?? 0.002;
  const dimensions = parseDimensions(svg);
  const width = Math.max(64, Math.min(dimensions.width, 1400));
  const height = Math.max(64, Math.min(dimensions.height, 1400));

  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (error) {
    return {
      status: "skipped",
      reason: "Playwright is not installed.",
      error: String(error),
    };
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    return {
      status: "skipped",
      reason:
        "Playwright browser launch failed. Run `npx playwright install chromium` and retry.",
      error: String(error),
    };
  }

  try {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();

    const html = [
      "<!doctype html><html><head><meta charset='utf-8' /></head>",
      "<body style='margin:0;background:#fff;display:grid;place-items:center;'>",
      svg,
      "</body></html>",
    ].join("");

    await page.setContent(html, { waitUntil: "load" });

    const frame0 = await page.screenshot({ type: "png" });
    await page.waitForTimeout(delayMs);
    const frame1 = await page.screenshot({ type: "png" });

    const { default: pixelmatch } = await import("pixelmatch");
    const image0 = PNG.sync.read(frame0);
    const image1 = PNG.sync.read(frame1);

    if (image0.width !== image1.width || image0.height !== image1.height) {
      return {
        status: "error",
        reason: "Frame dimensions mismatch.",
      };
    }

    const diff = new PNG({ width: image0.width, height: image0.height });
    const changedPixels = pixelmatch(
      image0.data,
      image1.data,
      diff.data,
      image0.width,
      image0.height,
      { threshold: 0.1 },
    );
    const totalPixels = image0.width * image0.height;
    const changedRatio = totalPixels > 0 ? changedPixels / totalPixels : 0;

    const outputDir = options.outputDir;
    if (outputDir) {
      await fs.writeFile(path.join(outputDir, `${label}-frame-0.png`), frame0);
      await fs.writeFile(path.join(outputDir, `${label}-frame-1.png`), frame1);
      await fs.writeFile(
        path.join(outputDir, `${label}-frame-diff.png`),
        PNG.sync.write(diff),
      );
    }

    return {
      status: "ok",
      viewport: { width: image0.width, height: image0.height },
      delayMs,
      changedPixels,
      totalPixels,
      changedRatio,
      motionThreshold: threshold,
      motionDetected: changedRatio >= threshold,
    };
  } finally {
    await browser.close();
  }
}

function parseXmlSnapshot(svg) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    allowBooleanAttributes: true,
  });
  try {
    return parser.parse(svg);
  } catch {
    return null;
  }
}

async function runQa(svg, options = {}) {
  const structural = structuralChecks(svg);
  const animation = hasAnimation(svg);
  const unsafeFindings = detectUnsafePatterns(svg);
  const elementCount = countElements(svg);
  const xmlSnapshot = structural.xmlValid ? parseXmlSnapshot(svg) : null;

  let motionResult = {
    status: "skipped",
    reason: "Render check disabled.",
  };
  if (options.render) {
    motionResult = await renderMotionCheck(svg, options);
  }

  const score = computeScore({
    structural,
    animation,
    unsafeFindings,
    motionResult,
    elementCount,
  });

  return {
    createdAt: new Date().toISOString(),
    summary: {
      score: score.score,
      grade: score.grade,
      passed: score.score >= 75,
    },
    checks: {
      structural,
      animation,
      unsafeFindings,
      elementCount,
      motion: motionResult,
    },
    snapshot: xmlSnapshot,
  };
}

module.exports = {
  runQa,
};
