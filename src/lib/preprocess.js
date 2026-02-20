function extractSvgFromText(input) {
  const text = String(input || "").trim();

  const fencedMatch = text.match(/```(?:svg|xml)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1] : text;

  const svgMatch = candidate.match(/<svg\b[\s\S]*?<\/svg>/i);
  if (!svgMatch) {
    throw new Error("No <svg>...</svg> block found in model response.");
  }

  return svgMatch[0].trim();
}

function sanitizeSvg(svgText) {
  let svg = String(svgText || "");
  const notes = [];

  const beforeScript = svg;
  svg = svg.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  if (svg !== beforeScript) {
    notes.push("Removed <script> elements.");
  }

  const beforeEventHandlers = svg;
  svg = svg.replace(/\son[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  if (svg !== beforeEventHandlers) {
    notes.push("Removed inline event-handler attributes.");
  }

  const beforeJsUrls = svg;
  svg = svg.replace(/\s(?:href|xlink:href)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, "");
  if (svg !== beforeJsUrls) {
    notes.push("Removed javascript: URL attributes.");
  }

  const beforeForeignObject = svg;
  svg = svg.replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, "");
  if (svg !== beforeForeignObject) {
    notes.push("Removed <foreignObject> elements.");
  }

  return {
    svg,
    notes,
  };
}

function preprocessSvg(input) {
  const extracted = extractSvgFromText(input);
  const sanitized = sanitizeSvg(extracted);
  const notes = ["Extracted <svg>...</svg> block from input text.", ...sanitized.notes];
  return {
    svg: sanitized.svg.trim(),
    notes,
  };
}

module.exports = {
  extractSvgFromText,
  sanitizeSvg,
  preprocessSvg,
};
