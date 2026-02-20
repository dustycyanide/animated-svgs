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
  let svg = svgText;
  const notes = [];

  const beforeScript = svg;
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, "");
  if (svg !== beforeScript) {
    notes.push("Removed <script> elements.");
  }

  const beforeEventHandlers = svg;
  svg = svg.replace(/\son[a-z0-9_-]+\s*=\s*(["'])[\s\S]*?\1/gi, "");
  if (svg !== beforeEventHandlers) {
    notes.push("Removed inline event-handler attributes.");
  }

  const beforeJsHref = svg;
  svg = svg.replace(
    /\s(?:href|xlink:href)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi,
    "",
  );
  if (svg !== beforeJsHref) {
    notes.push("Removed javascript: href attributes.");
  }

  const beforeForeignObject = svg;
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "");
  if (svg !== beforeForeignObject) {
    notes.push("Removed <foreignObject> blocks.");
  }

  return { svg, notes };
}

function upsertSvgRootAttributes(svgText, width, height) {
  const rootMatch = svgText.match(/<svg\b([^>]*)>/i);
  if (!rootMatch) {
    throw new Error("SVG root tag is missing.");
  }

  let rootAttrs = rootMatch[1];
  const notes = [];

  if (!/\bxmlns\s*=/.test(rootAttrs)) {
    rootAttrs += ' xmlns="http://www.w3.org/2000/svg"';
    notes.push("Added xmlns attribute.");
  }

  if (!/\bwidth\s*=/.test(rootAttrs)) {
    rootAttrs += ` width="${width}"`;
    notes.push("Added width attribute.");
  }

  if (!/\bheight\s*=/.test(rootAttrs)) {
    rootAttrs += ` height="${height}"`;
    notes.push("Added height attribute.");
  }

  if (!/\bviewBox\s*=/.test(rootAttrs)) {
    rootAttrs += ` viewBox="0 0 ${width} ${height}"`;
    notes.push("Added viewBox attribute.");
  }

  const updatedRoot = `<svg${rootAttrs}>`;
  return {
    svg: svgText.replace(/<svg\b[^>]*>/i, updatedRoot),
    notes,
  };
}

function preprocessSvg(input, { width = 1024, height = 1024 } = {}) {
  const extracted = extractSvgFromText(input);
  const sanitized = sanitizeSvg(extracted);
  const normalized = upsertSvgRootAttributes(sanitized.svg, width, height);

  return {
    svg: normalized.svg.trim(),
    notes: [...sanitized.notes, ...normalized.notes],
  };
}

module.exports = {
  extractSvgFromText,
  preprocessSvg,
};
