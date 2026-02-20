const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_PROMPT_POLISH_TEMPLATE,
  buildPromptPolishContents,
} = require("../src/lib/gemini");

test("buildPromptPolishContents injects default placeholders", () => {
  const output = buildPromptPolishContents({
    promptTemplate: DEFAULT_PROMPT_POLISH_TEMPLATE,
    formattedExamples: "1. A drifting jellyfish in moonlight.",
    userPrompt: "A lantern fish weaving around kelp.",
  });

  assert.match(output, /Style examples:\n1\. A drifting jellyfish in moonlight\./);
  assert.match(output, /User idea:\nA lantern fish weaving around kelp\./);
  assert.doesNotMatch(output, /\{\{\s*examples\s*\}\}/i);
  assert.doesNotMatch(output, /\{\{\s*userPrompt\s*\}\}/i);
});

test("buildPromptPolishContents appends missing sections when placeholders are absent", () => {
  const output = buildPromptPolishContents({
    promptTemplate: "Rewrite this idea with stronger motion verbs.",
    formattedExamples: "1. Rotating weather vane over rooftops.",
    userPrompt: "A comet crossing a star map.",
  });

  assert.match(output, /Rewrite this idea with stronger motion verbs\./);
  assert.match(output, /Style examples:\n1\. Rotating weather vane over rooftops\./);
  assert.match(output, /User idea:\nA comet crossing a star map\./);
});
