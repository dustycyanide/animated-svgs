const { XMLParser, XMLValidator } = require("fast-xml-parser");

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
  const rootMatch = svg.match(/<svg\b([^>]*)>/i);
  const rootAttrs = rootMatch ? rootMatch[1] : "";
  const hasWidth = /\bwidth\s*=/.test(rootAttrs);
  const hasHeight = /\bheight\s*=/.test(rootAttrs);
  const hasViewBox = /\bviewBox\s*=/.test(rootAttrs);
  const checks = {
    hasSvgRoot: /<svg\b[\s\S]*<\/svg>/i.test(svg),
    xmlValid: false,
    parseError: null,
    rootAttributes: {
      hasWidth,
      hasHeight,
      hasViewBox,
    },
  };

  const validation = XMLValidator.validate(svg);
  if (validation === true) {
    checks.xmlValid = true;
  } else {
    checks.parseError = validation?.err?.msg || "Unknown XML parse error.";
  }

  return checks;
}

function buildIssues({ structural, animation, unsafeFindings, hasDimensions }) {
  const issues = [];
  if (!structural.hasSvgRoot) {
    issues.push("Missing <svg> root element.");
  }
  if (!structural.xmlValid) {
    issues.push(
      structural.parseError ? `Invalid XML: ${structural.parseError}` : "Invalid XML.",
    );
  }
  if (!hasDimensions) {
    issues.push("Missing dimensions on root <svg> (need viewBox or width+height).");
  }
  if (!animation.any) {
    issues.push("No animation detected (SMIL tags or CSS animation).");
  }
  for (const finding of unsafeFindings) {
    issues.push(`Unsafe pattern: ${finding}`);
  }
  return issues;
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
  void options;
  const structural = structuralChecks(svg);
  const animation = hasAnimation(svg);
  const unsafeFindings = detectUnsafePatterns(svg);
  const elementCount = countElements(svg);
  const hasDimensions =
    structural.rootAttributes.hasViewBox ||
    (structural.rootAttributes.hasWidth && structural.rootAttributes.hasHeight);
  const issues = buildIssues({
    structural,
    animation,
    unsafeFindings,
    hasDimensions,
  });
  const xmlSnapshot = structural.xmlValid ? parseXmlSnapshot(svg) : null;

  return {
    createdAt: new Date().toISOString(),
    summary: {
      passed: issues.length === 0,
      issueCount: issues.length,
    },
    checks: {
      required: {
        hasSvgRoot: structural.hasSvgRoot,
        xmlValid: structural.xmlValid,
        hasDimensions,
        hasAnimation: animation.any,
      },
      structural,
      animation,
      unsafeFindings,
      elementCount,
      issues,
    },
    snapshot: xmlSnapshot,
  };
}

module.exports = {
  runQa,
};
