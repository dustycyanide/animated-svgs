const { GoogleGenAI } = require("@google/genai");
const fs = require("fs/promises");
const path = require("path");
const { ensureDir, slugify, timestampId } = require("./utils");

const RESULTS_ROOT = path.resolve(process.cwd(), "results");
let resultSequence = 0;

const SYSTEM_INSTRUCTION = [
  "You are an expert SVG motion designer.",
  "Return exactly one complete SVG document and nothing else.",
  "Format example: <svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"> ... </svg>.",
  "Your first non-whitespace characters must be <svg and your response must end with </svg>.",
  "Output must be valid XML with a single <svg> root.",
  "Include animation using SMIL tags (<animate>, <animateTransform>, <animateMotion>, or <set>) and/or CSS keyframes.",
  "Do not use JavaScript, <script>, external assets, raster images, or markdown fences.",
  "Prefer a clean structure with grouped layers, balanced timing, and smooth looping.",
].join(" ");

const MADLIB_SYSTEM_INSTRUCTION = [
  "You are a creative director for animated SVG scenes.",
  "Given structured mad-lib variables, write one concise but vivid prompt for an animated SVG.",
  "Keep the prompt focused on a single scene and one clear primary motion beat.",
  "Return plain text only with no markdown, no bullet points, and no JSON.",
].join(" ");

const PROMPT_POLISH_SYSTEM_INSTRUCTION = [
  "You are an expert prompt editor for animated SVG generation.",
  "Rewrite user ideas into a concise, vivid, production-ready SVG prompt.",
  "Preserve the user's core intent while improving clarity, motion detail, and style consistency.",
  "Return plain text only with no markdown, no bullets, no labels, and no surrounding quotes.",
].join(" ");

function nextResultDir(kind) {
  resultSequence += 1;
  const sequence = String(resultSequence).padStart(3, "0");
  const label = slugify(kind) || "gemini";
  return path.join(RESULTS_ROOT, `${timestampId()}-${sequence}-${label}`);
}

function serializeJson(value) {
  const seen = new WeakSet();
  return JSON.stringify(
    value,
    (key, item) => {
      if (typeof item === "bigint") {
        return item.toString();
      }
      if (item && typeof item === "object") {
        if (seen.has(item)) {
          return "[Circular]";
        }
        seen.add(item);
      }
      return item;
    },
    2,
  );
}

function serializeError(error) {
  if (!error || typeof error !== "object") {
    return {
      message: String(error),
    };
  }

  return {
    name: error.name || "Error",
    message: error.message || String(error),
    stack: error.stack || null,
    code: error.code || null,
    status: error.status || null,
    details: error.details || null,
    cause: error.cause ? String(error.cause) : null,
  };
}

async function writeResultRecord({
  kind,
  status,
  model,
  prompt,
  requestPayload,
  response,
  extractedText,
  error,
}) {
  const resultDir = nextResultDir(kind);
  await ensureDir(resultDir);

  const metadata = {
    loggedAt: new Date().toISOString(),
    kind,
    status,
    model,
  };

  await fs.writeFile(
    path.join(resultDir, "00-metadata.json"),
    `${serializeJson(metadata)}\n`,
    "utf8",
  );

  if (typeof prompt === "string" && prompt.length > 0) {
    await fs.writeFile(path.join(resultDir, "01-prompt.txt"), `${prompt}\n`, "utf8");
  }

  if (requestPayload) {
    await fs.writeFile(
      path.join(resultDir, "02-request.json"),
      `${serializeJson(requestPayload)}\n`,
      "utf8",
    );
  }

  if (response) {
    await fs.writeFile(
      path.join(resultDir, "03-response.json"),
      `${serializeJson(response)}\n`,
      "utf8",
    );
  }

  if (typeof extractedText === "string" && extractedText.length > 0) {
    await fs.writeFile(path.join(resultDir, "04-response-text.txt"), extractedText, "utf8");
  }

  if (error) {
    await fs.writeFile(
      path.join(resultDir, "05-error.json"),
      `${serializeJson(serializeError(error))}\n`,
      "utf8",
    );
  }

  return resultDir;
}

async function persistResultRecord(record) {
  try {
    return await writeResultRecord(record);
  } catch (error) {
    process.stderr.write(`Warning: failed to write Gemini result record: ${error.message}\n`);
    return null;
  }
}

function extractTextFromResponse(response) {
  if (typeof response?.text === "string" && response.text.trim().length > 0) {
    return response.text;
  }

  const partTexts =
    response?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text)
      .filter((text) => typeof text === "string" && text.trim().length > 0) || [];

  if (partTexts.length > 0) {
    return partTexts.join("\n");
  }

  return "";
}

async function expandMadlibPrompt({ apiKey, model, madlibText }) {
  const client = new GoogleGenAI({ apiKey });
  const requestPayload = {
    model,
    contents: madlibText,
    config: {
      responseMimeType: "text/plain",
      systemInstruction: MADLIB_SYSTEM_INSTRUCTION,
      temperature: 1,
      maxOutputTokens: 512,
    },
  };

  let response;
  try {
    response = await client.models.generateContent(requestPayload);
  } catch (error) {
    await persistResultRecord({
      kind: "madlib-prompt",
      status: "api-error",
      model,
      prompt: madlibText,
      requestPayload,
      error,
    });
    throw error;
  }

  const text = extractTextFromResponse(response).trim();
  const status = text ? "success" : "empty-response";
  await persistResultRecord({
    kind: "madlib-prompt",
    status,
    model: response?.modelVersion || model,
    prompt: madlibText,
    requestPayload,
    response,
    extractedText: text,
  });

  if (!text) {
    throw new Error("Gemini returned an empty mad-lib prompt.");
  }

  return {
    prompt: text.replace(/\s+/g, " ").trim(),
    modelVersion: response?.modelVersion || model,
  };
}

async function polishSvgPrompt({ apiKey, model, userPrompt, examples = [] }) {
  const client = new GoogleGenAI({ apiKey });
  const cleanedExamples = examples
    .map((item) => String(item || "").trim())
    .filter((item) => item.length > 0)
    .slice(0, 12);

  const formattedExamples =
    cleanedExamples.length > 0
      ? cleanedExamples.map((item, index) => `${index + 1}. ${item}`).join("\n")
      : "No examples provided.";

  const contents = [
    "Rewrite the following user idea into one polished prompt for animated SVG generation.",
    "Match the tone and structure of the style examples while keeping the same concept.",
    "",
    "Style examples:",
    formattedExamples,
    "",
    "User idea:",
    String(userPrompt || "").trim(),
    "",
    "Return only the rewritten prompt.",
  ].join("\n");

  const isGemini3Model = /^gemini-3/i.test(String(model));
  const config = {
    responseMimeType: "text/plain",
    systemInstruction: PROMPT_POLISH_SYSTEM_INSTRUCTION,
    temperature: 0.4,
    maxOutputTokens: 2048,
  };

  if (isGemini3Model) {
    config.thinkingConfig = {
      thinkingLevel: "low",
      includeThoughts: false,
    };
  }

  const requestPayload = {
    model,
    contents,
    config,
  };

  let response;
  try {
    response = await client.models.generateContent(requestPayload);
  } catch (error) {
    await persistResultRecord({
      kind: "prompt-polish",
      status: "api-error",
      model,
      prompt: userPrompt,
      requestPayload,
      error,
    });
    throw error;
  }

  const text = extractTextFromResponse(response).trim();
  const status = text ? "success" : "empty-response";
  await persistResultRecord({
    kind: "prompt-polish",
    status,
    model: response?.modelVersion || model,
    prompt: userPrompt,
    requestPayload,
    response,
    extractedText: text,
  });

  if (!text) {
    throw new Error("Gemini returned an empty polished prompt.");
  }

  return {
    prompt: text.replace(/\s+/g, " ").trim(),
    modelVersion: response?.modelVersion || model,
  };
}

async function generateAnimatedSvg({
  apiKey,
  model,
  prompt,
  width = 1024,
  height = 1024,
  temperature = 1,
}) {
  const client = new GoogleGenAI({ apiKey });
  const isGemini3Model = /^gemini-3/i.test(String(model));
  const config = {
    responseMimeType: "text/plain",
    systemInstruction: SYSTEM_INSTRUCTION,
    temperature,
    maxOutputTokens: isGemini3Model ? 16384 : 8192,
  };

  if (isGemini3Model) {
    config.thinkingConfig = {
      thinkingLevel: "low",
      includeThoughts: false,
    };
  }

  const combinedPrompt = [
    `Canvas target: ${width}x${height}.`,
    "Create a high-quality animated SVG scene from this prompt:",
    prompt,
  ].join("\n\n");
  const requestPayload = {
    model,
    contents: combinedPrompt,
    config,
  };

  let response;
  try {
    response = await client.models.generateContent(requestPayload);
  } catch (error) {
    await persistResultRecord({
      kind: "svg-generation",
      status: "api-error",
      model,
      prompt: prompt,
      requestPayload,
      error,
    });
    throw error;
  }

  const text = extractTextFromResponse(response);
  const status = text ? "success" : "empty-response";
  await persistResultRecord({
    kind: "svg-generation",
    status,
    model: response?.modelVersion || model,
    prompt,
    requestPayload,
    response,
    extractedText: text,
  });

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return {
    text,
    modelVersion: response?.modelVersion || model,
    usageMetadata: response?.usageMetadata || null,
    finishReason: response?.candidates?.[0]?.finishReason || null,
  };
}

module.exports = {
  expandMadlibPrompt,
  generateAnimatedSvg,
  polishSvgPrompt,
};
