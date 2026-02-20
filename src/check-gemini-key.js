const { findGeminiKey } = require("./lib/env");

const found = findGeminiKey();
if (!found) {
  console.error(
    "No Gemini API key found. Set GEMINI_API_KEY (preferred) or GOOGLE_API_KEY in .env.",
  );
  process.exit(1);
}

console.log(`Gemini API key found in ${found.name} (value hidden).`);
