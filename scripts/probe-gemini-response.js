#!/usr/bin/env node
const { GoogleGenAI } = require("@google/genai");
const { loadEnv, findGeminiKey } = require("../src/lib/env");

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-pro-preview";
const TEST_PROMPT =
  "Generate an SVG of a 3D isometric cardboard box that drops, folds its flaps, seals with tape, and turns into a confirmation checkmark. Crisp vector illustration with warm orange and neutral grey tones";
const SYSTEM_INSTRUCTION = [
  "You are an expert SVG motion designer.",
  "Return exactly one complete SVG document and nothing else.",
  "Format example: <svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"> ... </svg>.",
  "Output must be valid XML with a single <svg> root.",
  "Include animation using SMIL tags (<animate>, <animateTransform>, <animateMotion>, or <set>) and/or CSS keyframes.",
  "Do not use JavaScript, <script>, external assets, raster images, or markdown fences.",
  "Prefer a clean structure with grouped layers, balanced timing, and smooth looping.",
].join(" ");

function summarizeResponse(label, response) {
  const text = typeof response?.text === "string" ? response.text : "";
  const candidate = response?.candidates?.[0] || null;
  const parts = candidate?.content?.parts || [];

  const partSummary = parts.map((part, index) => ({
    index,
    thought: part?.thought === true,
    hasText: typeof part?.text === "string",
    textLength: typeof part?.text === "string" ? part.text.length : 0,
    keys: Object.keys(part || {}),
  }));

  const output = {
    label,
    modelVersion: response?.modelVersion || null,
    finishReason: candidate?.finishReason || null,
    textLength: text.length,
    containsSvgBlock: /<svg\b[\s\S]*<\/svg>/i.test(text),
    textPreview: text.slice(0, 700),
    usageMetadata: response?.usageMetadata || null,
    partSummary,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

async function runVariant(client, label, config) {
  const response = await client.models.generateContent({
    model: DEFAULT_MODEL,
    contents: `Canvas target: 1024x1024.\n\nCreate a high-quality animated SVG scene from this prompt:\n\n${TEST_PROMPT}`,
    config: {
      responseMimeType: "text/plain",
      systemInstruction: SYSTEM_INSTRUCTION,
      maxOutputTokens: 8192,
      ...config,
    },
  });
  summarizeResponse(label, response);
}

async function main() {
  loadEnv();
  const key = findGeminiKey();
  if (!key) {
    throw new Error("Missing GEMINI_API_KEY / GOOGLE_API_KEY.");
  }

  const client = new GoogleGenAI({ apiKey: key.value });
  process.stdout.write(`Model: ${DEFAULT_MODEL}\n`);

  await runVariant(client, "baseline", {
    temperature: 1,
  });

  await runVariant(client, "thinking_low", {
    temperature: 1,
    maxOutputTokens: 16384,
    thinkingConfig: {
      thinkingLevel: "low",
      includeThoughts: false,
    },
  });
}

main().catch((error) => {
  process.stderr.write(`Probe failed: ${error.message}\n`);
  process.exit(1);
});
