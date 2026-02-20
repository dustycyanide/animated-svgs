const test = require("node:test");
const assert = require("node:assert/strict");
const { preprocessSvg } = require("../src/lib/preprocess");

test("preprocessSvg strips scriptable SVG patterns", () => {
  const raw = `
\`\`\`svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" onload="alert('x')">
  <script>alert("evil")</script>
  <a href="javascript:alert('x')"><rect width="20" height="20" fill="red" /></a>
  <foreignObject><div>unsafe html</div></foreignObject>
  <circle cx="10" cy="10" r="6" fill="blue" />
</svg>
\`\`\`
`;

  const result = preprocessSvg(raw);

  assert.match(result.svg, /<svg\b/i);
  assert.match(result.svg, /<\/svg>/i);
  assert.doesNotMatch(result.svg, /<script\b/i);
  assert.doesNotMatch(result.svg, /\sonload\s*=/i);
  assert.doesNotMatch(result.svg, /javascript:/i);
  assert.doesNotMatch(result.svg, /<foreignObject\b/i);
  assert.match(result.svg, /<circle\b/i);
  assert.ok(result.notes.includes("Removed <script> elements."));
  assert.ok(result.notes.includes("Removed inline event-handler attributes."));
  assert.ok(result.notes.includes("Removed javascript: URL attributes."));
  assert.ok(result.notes.includes("Removed <foreignObject> elements."));
});
