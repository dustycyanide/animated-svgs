const path = require("path");
const dotenv = require("dotenv");

let loaded = false;
const DEFAULT_GEMINI_MODEL = "gemini-3.1-pro-preview";

function loadEnv() {
  if (loaded) {
    return;
  }

  const envPath = process.env.ENV_FILE
    ? path.resolve(process.cwd(), process.env.ENV_FILE)
    : path.resolve(process.cwd(), ".env");

  dotenv.config({ path: envPath, quiet: true });
  loaded = true;
}

function findGeminiKey() {
  loadEnv();

  const candidates = ["GEMINI_API_KEY", "GOOGLE_API_KEY"];
  for (const name of candidates) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim().length > 0) {
      return { name, value: value.trim() };
    }
  }

  return null;
}

function requireGeminiKey() {
  const key = findGeminiKey();
  if (!key) {
    throw new Error(
      "No Gemini API key found. Set GEMINI_API_KEY (preferred) or GOOGLE_API_KEY in .env.",
    );
  }
  return key;
}

function resolveGeminiModel(requestedModel) {
  loadEnv();

  if (typeof requestedModel === "string" && requestedModel.trim().length > 0) {
    return requestedModel.trim();
  }

  if (typeof process.env.GEMINI_MODEL === "string" && process.env.GEMINI_MODEL.trim().length > 0) {
    return process.env.GEMINI_MODEL.trim();
  }

  return DEFAULT_GEMINI_MODEL;
}

module.exports = {
  DEFAULT_GEMINI_MODEL,
  loadEnv,
  findGeminiKey,
  requireGeminiKey,
  resolveGeminiModel,
};
