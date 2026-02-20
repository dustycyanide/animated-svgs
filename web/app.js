const nextButton = document.getElementById("next-btn");
const prevPromptButton = document.getElementById("prev-prompt-btn");
const nextPromptButton = document.getElementById("next-prompt-btn");
const promptSelect = document.getElementById("prompt-select");
const parallelButton = document.getElementById("parallel-btn");
const parallelCountInput = document.getElementById("parallel-count-input");
const saveButton = document.getElementById("save-btn");
const copyButton = document.getElementById("copy-btn");
const polishButton = document.getElementById("polish-btn");
const generateCustomButton = document.getElementById("generate-custom-btn");
const createFromSvgButton = document.getElementById("create-from-svg-btn");
const useCurrentButton = document.getElementById("use-current-btn");
const openPasteModeButton = document.getElementById("open-paste-mode-btn");
const modelInput = document.getElementById("model-input");
const maxTokensInput = document.getElementById("max-tokens-input");
const reasoningLevelSelect = document.getElementById("reasoning-level-select");
const polishTemplateInput = document.getElementById("polish-template-input");
const resetPolishTemplateButton = document.getElementById("reset-polish-template-btn");
const refreshLibraryButton = document.getElementById("refresh-library-btn");
const showHiddenToggle = document.getElementById("show-hidden-toggle");
const customPromptInput = document.getElementById("custom-prompt-input");
const pasteSvgInput = document.getElementById("paste-svg-input");
const pasteLabelInput = document.getElementById("paste-label-input");
const customMetaEl = document.getElementById("custom-meta");
const pasteMetaEl = document.getElementById("paste-meta");
const statusEl = document.getElementById("status");
const promptEl = document.getElementById("prompt");
const categoryEl = document.getElementById("category");
const modelMetaEl = document.getElementById("model-meta");
const viewerEl = document.getElementById("svg-viewer");
const viewerEmptyEl = document.getElementById("viewer-empty");
const viewerStageEl = viewerEl ? viewerEl.parentElement : null;
const copySvgButton = document.getElementById("copy-svg-btn");
const copySvgFeedbackEl = document.getElementById("copy-svg-feedback");
const discordExportPresetSelect = document.getElementById("discord-export-preset");
const discordExportButton = document.getElementById("discord-export-btn");
const discordExportFeedbackEl = document.getElementById("discord-export-feedback");
const modelDetailsEl = document.getElementById("model-details");
const modelSummaryEl = document.getElementById("model-summary");
const modelResponseEl = document.getElementById("model-response");
const libraryMetaEl = document.getElementById("library-meta");
const libraryListEl = document.getElementById("library-list");
const parallelMetaEl = document.getElementById("parallel-meta");
const parallelResultsListEl = document.getElementById("parallel-results-list");
const carouselNewestButton = document.getElementById("carousel-newest-btn");
const carouselNewerButton = document.getElementById("carousel-newer-btn");
const carouselOlderButton = document.getElementById("carousel-older-btn");
const carouselOldestButton = document.getElementById("carousel-oldest-btn");
const carouselPositionEl = document.getElementById("carousel-position");
const cutModeSelect = document.getElementById("cut-mode-select");
const cutRatioInput = document.getElementById("cut-ratio-input");
const themeSelect = document.getElementById("theme-select");
const generationModeSelect = document.getElementById("generation-mode-select");
const fixedControlsBlock = document.getElementById("fixed-controls-block");
const customControlsBlock = document.getElementById("custom-controls-block");
const pasteControlsBlock = document.getElementById("paste-controls-block");
const cutRatioControlEl = cutRatioInput?.closest(".cut-ratio-control");

let currentPrompt = "";
let currentCategory = "";
let currentSeed = null;
let currentPromptIndex = null;
let currentPromptCount = null;
let currentPromptMode = null;
let currentSvgUrl = null;
let currentSvgText = "";
let currentAssetName = null;
let currentAssetScope = null;
let currentGenerationConfig = null;

let composePromptMode = "custom";
let generationMode = "examples";
const DEFAULT_MODEL = "gemini-3.1-pro-preview";
const DEFAULT_MAX_OUTPUT_TOKENS = 16384;
const ALLOWED_REASONING_LEVELS = new Set(["off", "low", "medium", "high"]);
const ALLOWED_CUT_MODES = new Set(["original", "square", "circle", "ratio"]);
const ALLOWED_GENERATION_MODES = new Set(["examples", "custom", "paste"]);
const THEME_STORAGE_KEY = "animated-svgs-theme";
const POLISH_TEMPLATE_PLACEHOLDERS = "{{examples}}, {{userPrompt}}";
const EMPTY_VIEWER_MESSAGE = "No SVG yet. Generate one or paste an SVG to create a new asset.";
const DISCORD_EXPORT_TIME_HINT = "Export to Discord can take up to 2 minutes.";
let defaultPolishPromptTemplate = "";

let libraryScope = "created";
let libraryItems = [];
let libraryArchivedCount = 0;
let fixedPrompts = [];
let selectedFixedPromptIndex = null;
let parallelResultItems = [];
let carouselItems = [];
let carouselIndex = null;
let discordExportPresets = [];

let isLoading = false;
let isLibraryLoading = false;

function setStatus(message, { isError = false, isLoadingState = false } = {}) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
  statusEl.classList.toggle("loading", isLoadingState);
}

function getCustomPromptValue() {
  return String(customPromptInput.value || "").trim();
}

function getPastedSvgValue() {
  return String(pasteSvgInput?.value || "").trim();
}

function getPastedLabelValue() {
  return String(pasteLabelInput?.value || "").trim();
}

function setCustomMeta(message = "") {
  customMetaEl.textContent = message;
}

function setPasteMeta(message = "") {
  if (!pasteMetaEl) {
    return;
  }
  pasteMetaEl.textContent = message;
}

function setCopySvgFeedback(message = "", { isError = false } = {}) {
  if (!copySvgFeedbackEl) {
    return;
  }
  copySvgFeedbackEl.textContent = message;
  copySvgFeedbackEl.classList.toggle("error", isError);
}

function setDiscordExportFeedback(message = "", { isError = false } = {}) {
  if (!discordExportFeedbackEl) {
    return;
  }
  discordExportFeedbackEl.textContent = message;
  discordExportFeedbackEl.classList.toggle("error", isError);
}

function getSelectedModel() {
  const value = String(modelInput?.value || "").trim();
  return value || DEFAULT_MODEL;
}

function getMaxOutputTokens() {
  if (!maxTokensInput) {
    return DEFAULT_MAX_OUTPUT_TOKENS;
  }
  const raw = Number.parseInt(String(maxTokensInput.value || ""), 10);
  if (!Number.isInteger(raw) || raw <= 0) {
    return DEFAULT_MAX_OUTPUT_TOKENS;
  }
  const clamped = Math.min(Math.max(raw, 256), 65536);
  maxTokensInput.value = String(clamped);
  return clamped;
}

function getThinkingLevel() {
  const value = String(reasoningLevelSelect?.value || "low").toLowerCase();
  if (!ALLOWED_REASONING_LEVELS.has(value)) {
    return "low";
  }
  return value;
}

function getGenerationConfig() {
  return {
    maxOutputTokens: getMaxOutputTokens(),
    thinkingLevel: getThinkingLevel(),
  };
}

function getPolishPromptTemplate() {
  if (!polishTemplateInput) {
    return null;
  }
  const value = String(polishTemplateInput.value || "").trim();
  if (!value) {
    return null;
  }
  if (defaultPolishPromptTemplate && value === defaultPolishPromptTemplate) {
    return null;
  }
  return value;
}

function resetPolishTemplate() {
  if (!polishTemplateInput) {
    return;
  }
  polishTemplateInput.value = defaultPolishPromptTemplate || "";
}

async function loadPolishTemplateConfig() {
  if (!polishTemplateInput) {
    return;
  }

  try {
    const payload = await fetchJson("/api/polish-template");
    const template = typeof payload?.template === "string" ? payload.template.trim() : "";
    const placeholders = Array.isArray(payload?.placeholders)
      ? payload.placeholders.join(", ")
      : POLISH_TEMPLATE_PLACEHOLDERS;
    defaultPolishPromptTemplate = template;
    if (!String(polishTemplateInput.value || "").trim()) {
      polishTemplateInput.value = template;
    }
    polishTemplateInput.placeholder = `Use ${placeholders}`;
  } catch {
    polishTemplateInput.placeholder = `Use ${POLISH_TEMPLATE_PLACEHOLDERS}`;
  }

  refreshControlStates();
}

function normalizeGenerationMode(rawMode) {
  const value = String(rawMode || "examples").toLowerCase();
  if (!ALLOWED_GENERATION_MODES.has(value)) {
    return "examples";
  }
  return value;
}

function applyGenerationMode(mode) {
  generationMode = normalizeGenerationMode(mode);
  if (generationModeSelect) {
    generationModeSelect.value = generationMode;
  }
  if (fixedControlsBlock) {
    fixedControlsBlock.hidden = generationMode !== "examples";
  }
  if (customControlsBlock) {
    customControlsBlock.hidden = generationMode !== "custom";
  }
  if (pasteControlsBlock) {
    pasteControlsBlock.hidden = generationMode !== "paste";
  }
  refreshControlStates();
}

function normalizeTheme(rawTheme) {
  const value = String(rawTheme || "light").toLowerCase();
  return value === "dark" ? "dark" : "light";
}

function applyTheme(theme) {
  const normalized = normalizeTheme(theme);
  document.documentElement.setAttribute("data-theme", normalized);
  if (themeSelect) {
    themeSelect.value = normalized;
  }
}

function loadThemePreference() {
  let storedTheme = "light";
  try {
    storedTheme = localStorage.getItem(THEME_STORAGE_KEY) || "light";
  } catch {
    storedTheme = "light";
  }
  applyTheme(storedTheme);
}

function parseRatioValue(rawValue) {
  const input = String(rawValue || "").trim();
  if (!input) {
    return null;
  }

  const ratioMatch = input.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (ratioMatch) {
    const left = Number.parseFloat(ratioMatch[1]);
    const right = Number.parseFloat(ratioMatch[2]);
    if (Number.isFinite(left) && Number.isFinite(right) && left > 0 && right > 0) {
      return left / right;
    }
    return null;
  }

  const numeric = Number.parseFloat(input);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
}

function getCutMode() {
  const value = String(cutModeSelect?.value || "original").toLowerCase();
  if (!ALLOWED_CUT_MODES.has(value)) {
    return "original";
  }
  return value;
}

function applyCutMode() {
  if (!viewerStageEl) {
    return;
  }
  const mode = getCutMode();
  viewerStageEl.classList.remove("cut-mode-square", "cut-mode-circle", "cut-mode-ratio");

  if (mode === "square") {
    viewerStageEl.classList.add("cut-mode-square");
  } else if (mode === "circle") {
    viewerStageEl.classList.add("cut-mode-circle");
  } else if (mode === "ratio") {
    const parsedRatio = parseRatioValue(cutRatioInput?.value || "");
    viewerStageEl.classList.add("cut-mode-ratio");
    viewerStageEl.style.setProperty("--cut-ratio", String(parsedRatio || 16 / 9));
  }

  if (cutRatioInput) {
    const showRatioControl = mode === "ratio";
    if (cutRatioControlEl) {
      cutRatioControlEl.hidden = !showRatioControl;
    }
  }
}

function refreshControlStates() {
  const hasCurrentPrompt = Boolean(currentPrompt);
  const hasCurrentSvg = Boolean(currentSvgText);
  const hasCustomPrompt = Boolean(getCustomPromptValue());
  const hasPastedSvg = Boolean(getPastedSvgValue());
  const hasFixedPrompt = fixedPrompts.length > 0 && Number.isInteger(selectedFixedPromptIndex);
  const canGenerateSelected = fixedPrompts.length === 0 || hasCurrentPrompt;
  const isExamplesMode = generationMode === "examples";
  const isCustomMode = generationMode === "custom";
  const isPasteMode = generationMode === "paste";

  nextButton.disabled = isLoading || !canGenerateSelected || !isExamplesMode;
  prevPromptButton.disabled = isLoading || !hasFixedPrompt || !isExamplesMode;
  nextPromptButton.disabled = isLoading || !hasFixedPrompt || !isExamplesMode;
  promptSelect.disabled = isLoading || fixedPrompts.length === 0 || !isExamplesMode;
  parallelButton.disabled = isLoading || !hasFixedPrompt || !isExamplesMode;
  parallelCountInput.disabled = isLoading || fixedPrompts.length === 0 || !isExamplesMode;
  saveButton.disabled = isLoading || !hasCurrentPrompt;
  copyButton.disabled = isLoading || !hasCurrentPrompt;
  if (copySvgButton) {
    copySvgButton.disabled = isLoading || !hasCurrentSvg;
  }
  if (discordExportPresetSelect) {
    discordExportPresetSelect.disabled = isLoading || discordExportPresets.length === 0;
  }
  if (discordExportButton) {
    discordExportButton.disabled = isLoading || !hasCurrentSvg || discordExportPresets.length === 0;
  }
  useCurrentButton.disabled = isLoading || !hasCurrentPrompt;
  polishButton.disabled = isLoading || !hasCustomPrompt || !isCustomMode;
  generateCustomButton.disabled = isLoading || !hasCustomPrompt || !isCustomMode;
  customPromptInput.disabled = isLoading || !isCustomMode;
  if (createFromSvgButton) {
    createFromSvgButton.disabled = isLoading || !hasPastedSvg || !isPasteMode;
  }
  if (pasteSvgInput) {
    pasteSvgInput.disabled = isLoading || !isPasteMode;
  }
  if (pasteLabelInput) {
    pasteLabelInput.disabled = isLoading || !isPasteMode;
  }
  if (openPasteModeButton) {
    openPasteModeButton.disabled = isLoading;
  }
  if (modelInput) {
    modelInput.disabled = isLoading;
  }
  if (maxTokensInput) {
    maxTokensInput.disabled = isLoading;
  }
  if (reasoningLevelSelect) {
    reasoningLevelSelect.disabled = isLoading;
  }
  if (polishTemplateInput) {
    polishTemplateInput.disabled = isLoading;
  }
  if (resetPolishTemplateButton) {
    resetPolishTemplateButton.disabled = isLoading || !defaultPolishPromptTemplate;
  }

  refreshLibraryButton.disabled = isLibraryLoading;
  showHiddenToggle.disabled = isLibraryLoading;
  renderCarouselControls();
}

function setLoading(loading) {
  isLoading = loading;
  refreshControlStates();
}

function setLibraryLoading(loading) {
  isLibraryLoading = loading;
  refreshControlStates();
}

function renderMeta() {
  const parts = [];
  if (currentPromptMode) {
    parts.push(`Mode: ${currentPromptMode}`);
  }
  if (currentCategory) {
    parts.push(`Category: ${currentCategory}`);
  }
  if (
    Number.isInteger(currentPromptIndex) &&
    Number.isInteger(currentPromptCount) &&
    currentPromptCount > 0
  ) {
    parts.push(`Prompt ${currentPromptIndex + 1}/${currentPromptCount}`);
  }
  if (currentAssetName) {
    parts.push(`File: ${currentAssetName}`);
  }
  categoryEl.textContent = parts.join(" | ");
}

function updateSvg(svgText) {
  currentSvgText = String(svgText || "");
  if (currentSvgUrl) {
    URL.revokeObjectURL(currentSvgUrl);
  }
  const blob = new Blob([currentSvgText], { type: "image/svg+xml" });
  currentSvgUrl = URL.createObjectURL(blob);
  viewerEl.data = currentSvgUrl;
  if (viewerStageEl) {
    viewerStageEl.classList.add("has-content");
  }
  if (viewerEmptyEl) {
    viewerEmptyEl.textContent = EMPTY_VIEWER_MESSAGE;
  }
  setCopySvgFeedback("");
  setDiscordExportFeedback("");
  refreshControlStates();
}

function clearSvg(message = EMPTY_VIEWER_MESSAGE) {
  currentSvgText = "";
  if (currentSvgUrl) {
    URL.revokeObjectURL(currentSvgUrl);
    currentSvgUrl = null;
  }
  viewerEl.removeAttribute("data");
  if (viewerStageEl) {
    viewerStageEl.classList.remove("has-content");
  }
  if (viewerEmptyEl) {
    viewerEmptyEl.textContent = message;
  }
  setCopySvgFeedback("");
  setDiscordExportFeedback("");
  refreshControlStates();
}

function renderModelMeta(payload) {
  const parts = [];
  if (payload.model) {
    parts.push(`Model: ${payload.model}`);
  }
  if (payload.finishReason) {
    parts.push(`Finish: ${payload.finishReason}`);
  }
  const thoughts = payload?.usageMetadata?.thoughtsTokenCount;
  const total = payload?.usageMetadata?.totalTokenCount;
  if (Number.isFinite(thoughts)) {
    parts.push(`Thought tokens: ${thoughts}`);
  }
  if (Number.isFinite(total)) {
    parts.push(`Total tokens: ${total}`);
  }
  const effectiveConfig =
    payload?.generationConfig && typeof payload.generationConfig === "object"
      ? payload.generationConfig
      : currentGenerationConfig;
  if (Number.isInteger(effectiveConfig?.maxOutputTokens)) {
    parts.push(`Max tokens: ${effectiveConfig.maxOutputTokens}`);
  }
  if (typeof effectiveConfig?.thinkingLevel === "string") {
    parts.push(`Reasoning: ${effectiveConfig.thinkingLevel}`);
  }
  modelMetaEl.textContent = parts.join(" | ");
}

function renderModelResponse(rawModelResponse) {
  const text = rawModelResponse || "";
  if (!text) {
    modelDetailsEl.hidden = true;
    modelDetailsEl.open = false;
    modelSummaryEl.textContent = "Raw model response";
    modelResponseEl.textContent = "";
    return;
  }

  modelDetailsEl.hidden = false;
  modelResponseEl.textContent = `Raw Model Response:\n\n${text}`;
  modelSummaryEl.textContent = `Raw model response (${text.length.toLocaleString()} chars)`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error || "Request failed.");
    error.payload = payload;
    throw error;
  }
  return payload;
}

function getDefaultDiscordExportPresets() {
  return [
    { id: "attachment-webp", label: "Chat Attachment (Animated WebP)", sizeLimitBytes: 10 * 1024 * 1024 },
    { id: "emoji-webp", label: "Server Emoji (Animated WebP)", sizeLimitBytes: 256 * 1024 },
    { id: "emoji-gif", label: "Server Emoji (GIF)", sizeLimitBytes: 256 * 1024 },
    { id: "sticker-apng", label: "Sticker (APNG)", sizeLimitBytes: 512 * 1024 },
  ];
}

function renderDiscordExportPresetOptions() {
  if (!discordExportPresetSelect) {
    return;
  }

  discordExportPresetSelect.innerHTML = "";
  for (const preset of discordExportPresets) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    discordExportPresetSelect.appendChild(option);
  }
}

async function loadDiscordExportPresets() {
  const fallbackPresets = getDefaultDiscordExportPresets();

  try {
    const payload = await fetchJson("/api/discord-export/presets");
    const serverPresets = Array.isArray(payload?.presets) ? payload.presets : [];
    discordExportPresets = serverPresets.length > 0 ? serverPresets : fallbackPresets;
  } catch {
    discordExportPresets = fallbackPresets;
  }

  renderDiscordExportPresetOptions();
  refreshControlStates();
}

function getSelectedDiscordExportPresetId() {
  const selectedId = String(discordExportPresetSelect?.value || "").trim();
  if (!selectedId) {
    return "attachment-webp";
  }
  return selectedId;
}

function bytesToLabel(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) {
    return "0 B";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType || "application/octet-stream" });
}

function downloadBlob(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function normalizeFixedPromptIndex(index) {
  const count = fixedPrompts.length;
  if (count <= 0) {
    return null;
  }
  return ((index % count) + count) % count;
}

function formatPromptOptionLabel(entry) {
  const prefix = `${entry.promptIndex + 1}.`;
  return `${prefix} ${compact(entry.prompt, 88)}`;
}

function renderPromptOptions() {
  promptSelect.innerHTML = "";
  if (!fixedPrompts.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No fixed prompts available";
    promptSelect.appendChild(option);
    return;
  }

  for (const entry of fixedPrompts) {
    const option = document.createElement("option");
    option.value = String(entry.promptIndex);
    option.textContent = formatPromptOptionLabel(entry);
    promptSelect.appendChild(option);
  }
}

function syncPromptSelect() {
  if (!Number.isInteger(selectedFixedPromptIndex)) {
    promptSelect.value = "";
    return;
  }
  promptSelect.value = String(selectedFixedPromptIndex);
}

function clampParallelCount() {
  const promptCount = fixedPrompts.length;
  const maxCount = promptCount > 0 ? promptCount : 1;
  const raw = Number.parseInt(String(parallelCountInput.value || "1"), 10);
  const normalized = Number.isInteger(raw) ? raw : 1;
  const clamped = Math.min(Math.max(normalized, 1), maxCount);
  parallelCountInput.value = String(clamped);
  parallelCountInput.max = String(maxCount);
  return clamped;
}

function getSelectedFixedPrompt() {
  if (!fixedPrompts.length || !Number.isInteger(selectedFixedPromptIndex)) {
    return null;
  }
  return fixedPrompts[selectedFixedPromptIndex] || null;
}

function setSelectedFixedPrompt(index, { silent = false } = {}) {
  const normalized = normalizeFixedPromptIndex(index);
  if (!Number.isInteger(normalized)) {
    return;
  }
  selectedFixedPromptIndex = normalized;
  const selected = getSelectedFixedPrompt();
  if (!selected) {
    return;
  }

  syncPromptSelect();
  clampParallelCount();
  applyPromptSelection(selected);
  if (!silent) {
    setStatus(`Selected prompt ${selected.promptIndex + 1}/${selected.promptCount}.`);
  }
  refreshControlStates();
}

function cycleFixedPrompt(step) {
  if (!fixedPrompts.length) {
    return;
  }
  const current = Number.isInteger(selectedFixedPromptIndex) ? selectedFixedPromptIndex : 0;
  setSelectedFixedPrompt(current + step);
}

async function loadFixedPrompts() {
  const payload = await fetchJson("/api/prompts");
  fixedPrompts = Array.isArray(payload.prompts) ? payload.prompts : [];

  renderPromptOptions();
  clampParallelCount();

  if (!fixedPrompts.length) {
    selectedFixedPromptIndex = null;
    refreshControlStates();
    setStatus("Fixed prompt list unavailable for this mode. Generate Selected uses server prompt mode.");
    return;
  }

  setSelectedFixedPrompt(0, { silent: true });
  setStatus(`Loaded ${fixedPrompts.length} example prompts. Select one to generate.`);
}

function formatDateTime(iso) {
  if (!iso) {
    return "Unknown time";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }
  return date.toLocaleString();
}

function compact(text, max = 70) {
  const value = String(text || "").trim().replace(/\s+/g, " ");
  if (!value) {
    return "";
  }
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function renderParallelResults() {
  if (!parallelResultsListEl || !parallelMetaEl) {
    return;
  }
  parallelResultsListEl.innerHTML = "";

  if (!parallelResultItems.length) {
    parallelMetaEl.textContent = "No parallel batch yet.";
    return;
  }

  parallelMetaEl.textContent = `${parallelResultItems.length} results available in current batch.`;

  for (const item of parallelResultItems) {
    const row = document.createElement("li");
    row.className = "parallel-item";
    if (
      item.payload?.savedAsset?.name === currentAssetName &&
      item.payload?.savedAsset?.scope === currentAssetScope
    ) {
      row.classList.add("active");
    }

    const title = document.createElement("p");
    title.className = "parallel-item-title";
    title.textContent = `Result ${item.index + 1}: ${compact(item.payload?.prompt, 66) || "Generated SVG"}`;

    const meta = document.createElement("p");
    meta.className = "parallel-item-meta";
    const parts = [];
    if (item.payload?.savedAsset?.name) {
      parts.push(item.payload.savedAsset.name);
    }
    if (item.payload?.finishReason) {
      parts.push(`Finish: ${item.payload.finishReason}`);
    }
    meta.textContent = parts.join(" | ");

    const previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.className = "btn btn-secondary btn-mini";
    previewButton.textContent = "View";
    previewButton.addEventListener("click", () => {
      applyGenerationPayload(item.payload);
      if (libraryItems.length > 0) {
        renderLibraryList({
          scope: libraryScope,
          items: libraryItems,
          archivedCount: libraryArchivedCount,
        });
      } else {
        renderParallelResults();
      }
      setStatus(`Viewing parallel result ${item.index + 1}.`);
    });

    row.appendChild(title);
    row.appendChild(meta);
    row.appendChild(previewButton);
    parallelResultsListEl.appendChild(row);
  }
}

function clearParallelResults() {
  parallelResultItems = [];
  renderParallelResults();
}

function syncCarouselFromCurrentSelection() {
  if (!carouselItems.length) {
    carouselIndex = null;
    return;
  }
  const foundIndex = carouselItems.findIndex(
    (item) => item.name === currentAssetName && item.scope === currentAssetScope,
  );
  carouselIndex = foundIndex >= 0 ? foundIndex : null;
}

function renderCarouselControls() {
  if (
    !carouselNewestButton ||
    !carouselNewerButton ||
    !carouselOlderButton ||
    !carouselOldestButton ||
    !carouselPositionEl
  ) {
    return;
  }

  const disabledForBusy = isLoading || isLibraryLoading;
  const hasItems = carouselItems.length > 0;
  const hasSelection = Number.isInteger(carouselIndex) && carouselIndex >= 0;

  if (!hasItems) {
    carouselPositionEl.textContent = "No saved SVGs available.";
    carouselNewestButton.disabled = true;
    carouselNewerButton.disabled = true;
    carouselOlderButton.disabled = true;
    carouselOldestButton.disabled = true;
    return;
  }

  if (!hasSelection) {
    carouselPositionEl.textContent = `${carouselItems.length} saved SVGs. Use Newest/Oldest to start.`;
    carouselNewestButton.disabled = disabledForBusy;
    carouselOldestButton.disabled = disabledForBusy;
    carouselNewerButton.disabled = true;
    carouselOlderButton.disabled = true;
    return;
  }

  const position = carouselIndex + 1;
  carouselPositionEl.textContent = `${position}/${carouselItems.length} (${carouselItems[carouselIndex].name})`;
  carouselNewestButton.disabled = disabledForBusy || carouselIndex === 0;
  carouselNewerButton.disabled = disabledForBusy || carouselIndex === 0;
  carouselOlderButton.disabled = disabledForBusy || carouselIndex >= carouselItems.length - 1;
  carouselOldestButton.disabled = disabledForBusy || carouselIndex >= carouselItems.length - 1;
}

async function previewCarouselIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= carouselItems.length) {
    return;
  }
  carouselIndex = index;
  renderCarouselControls();
  const item = carouselItems[index];
  await previewLibraryItem(item);
}

async function navigateCarousel(mode) {
  if (!carouselItems.length) {
    return;
  }
  const hasSelection = Number.isInteger(carouselIndex);
  const currentIndex = hasSelection ? carouselIndex : 0;
  let targetIndex = currentIndex;
  if (!hasSelection) {
    targetIndex = mode === "oldest" ? carouselItems.length - 1 : 0;
  } else if (mode === "newest") {
    targetIndex = 0;
  } else if (mode === "newer") {
    targetIndex = Math.max(0, currentIndex - 1);
  } else if (mode === "older") {
    targetIndex = Math.min(carouselItems.length - 1, currentIndex + 1);
  } else if (mode === "oldest") {
    targetIndex = carouselItems.length - 1;
  }

  if (targetIndex === currentIndex && Number.isInteger(carouselIndex)) {
    renderCarouselControls();
    return;
  }
  await previewCarouselIndex(targetIndex);
}

function renderLibraryMeta(payload) {
  const count = payload.items.length;
  if (payload.scope === "created") {
    libraryMetaEl.textContent = `${count} created | ${libraryArchivedCount} hidden`;
    return;
  }
  libraryMetaEl.textContent = `${count} hidden`;
}

function renderLibraryList(payload) {
  libraryScope = payload.scope;
  libraryItems = payload.items;
  carouselItems = libraryItems.slice();
  if (payload.scope === "created" && Number.isInteger(payload.archivedCount)) {
    libraryArchivedCount = payload.archivedCount;
  }
  renderLibraryMeta(payload);
  libraryListEl.innerHTML = "";

  if (!libraryItems.length) {
    const empty = document.createElement("li");
    empty.className = "library-empty";
    empty.textContent =
      libraryScope === "created"
        ? "No created SVGs yet. Generate selected, parallel, custom, or paste an SVG."
        : "No hidden SVGs.";
    libraryListEl.appendChild(empty);
    carouselIndex = null;
    renderCarouselControls();
    renderParallelResults();
    return;
  }

  for (const item of libraryItems) {
    const row = document.createElement("li");
    row.className = "library-item";
    if (item.name === currentAssetName && item.scope === currentAssetScope) {
      row.classList.add("selected");
    }

    const textWrap = document.createElement("div");
    textWrap.className = "library-item-text";

    const title = document.createElement("p");
    title.className = "library-item-title";
    title.textContent = compact(item.prompt) || item.name;

    const sub = document.createElement("p");
    sub.className = "library-item-sub";
    const detailParts = [item.name, formatDateTime(item.createdAt)];
    if (item.category) {
      detailParts.push(item.category);
    }
    sub.textContent = detailParts.join(" | ");

    textWrap.appendChild(title);
    textWrap.appendChild(sub);

    const actionWrap = document.createElement("div");
    actionWrap.className = "library-item-actions";

    const previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.className = "btn btn-secondary btn-mini";
    previewButton.textContent = "Preview";
    previewButton.addEventListener("click", () => {
      previewLibraryItem(item);
    });
    actionWrap.appendChild(previewButton);

    const actionSelect = document.createElement("select");
    actionSelect.className = "select-input library-action-select";
    actionSelect.setAttribute("aria-label", `Actions for ${item.name}`);

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Actions";
    actionSelect.appendChild(defaultOption);

    const moveOption = document.createElement("option");
    moveOption.value = item.scope === "created" ? "hide" : "unhide";
    moveOption.textContent = item.scope === "created" ? "Hide" : "Unhide";
    actionSelect.appendChild(moveOption);

    const deleteOption = document.createElement("option");
    deleteOption.value = "delete";
    deleteOption.textContent = "Delete";
    actionSelect.appendChild(deleteOption);

    actionSelect.addEventListener("change", async () => {
      const action = actionSelect.value;
      if (!action) {
        return;
      }
      actionSelect.disabled = true;
      actionSelect.value = "";
      if (action === "hide") {
        await hideLibraryItem(item.name);
      } else if (action === "unhide") {
        await unhideLibraryItem(item.name);
      } else if (action === "delete") {
        await deleteLibraryItem(item.name, item.scope);
      }
      if (libraryListEl.contains(actionSelect)) {
        actionSelect.disabled = false;
      }
    });
    actionWrap.appendChild(actionSelect);

    row.appendChild(textWrap);
    row.appendChild(actionWrap);
    libraryListEl.appendChild(row);
  }

  syncCarouselFromCurrentSelection();
  renderCarouselControls();
  renderParallelResults();
}

async function loadLibrary({ preserveSelection = true } = {}) {
  const scope = showHiddenToggle.checked ? "archived" : "created";
  try {
    setLibraryLoading(true);
    const payload = await fetchJson(`/api/library?scope=${scope}`);
    if (!preserveSelection) {
      currentAssetName = null;
      currentAssetScope = null;
    } else if (currentAssetName) {
      const hasCurrent = payload.items.some(
        (item) => item.name === currentAssetName && item.scope === currentAssetScope,
      );
      if (!hasCurrent && payload.scope === currentAssetScope) {
        currentAssetName = null;
        currentAssetScope = null;
        renderMeta();
      }
    }
    renderLibraryList(payload);
  } catch (error) {
    setStatus(`Library load failed: ${error.message}`, { isError: true });
  } finally {
    setLibraryLoading(false);
  }
}

function applyGenerationPayload(payload) {
  currentPrompt = payload.prompt || "";
  currentCategory = payload.category || "";
  currentSeed = payload.seed || null;
  currentPromptIndex = Number.isInteger(payload.promptIndex) ? payload.promptIndex : null;
  currentPromptCount = Number.isInteger(payload.promptCount) ? payload.promptCount : null;
  currentPromptMode = payload.promptMode || null;
  currentAssetName = payload?.savedAsset?.name || null;
  currentAssetScope = payload?.savedAsset?.scope || null;
  currentGenerationConfig = payload?.generationConfig || getGenerationConfig();
  if (Number.isInteger(currentPromptIndex) && fixedPrompts.length > 0) {
    selectedFixedPromptIndex = normalizeFixedPromptIndex(currentPromptIndex);
    syncPromptSelect();
  }

  promptEl.textContent = currentPrompt;
  renderMeta();
  renderModelMeta(payload);
  renderModelResponse(payload.rawModelResponse);

  if (payload.svg) {
    updateSvg(payload.svg);
  } else {
    clearSvg("No SVG was returned for this run.");
  }
  syncCarouselFromCurrentSelection();
  renderCarouselControls();
  renderParallelResults();
}

function applyPromptSelection(payload) {
  currentPrompt = payload.prompt || "";
  currentCategory = payload.category || "";
  currentSeed = payload.seed || null;
  currentPromptIndex = Number.isInteger(payload.promptIndex) ? payload.promptIndex : null;
  currentPromptCount = Number.isInteger(payload.promptCount) ? payload.promptCount : null;
  currentPromptMode = payload.promptMode || null;
  currentAssetName = null;
  currentAssetScope = null;
  currentGenerationConfig = getGenerationConfig();
  if (Number.isInteger(currentPromptIndex) && fixedPrompts.length > 0) {
    selectedFixedPromptIndex = normalizeFixedPromptIndex(currentPromptIndex);
    syncPromptSelect();
  }

  promptEl.textContent = currentPrompt || "(No prompt selected)";
  renderMeta();
  renderModelMeta({ model: getSelectedModel() });
  renderModelResponse("");
  syncCarouselFromCurrentSelection();
  renderCarouselControls();
}

async function previewLibraryItem(item) {
  try {
    setStatus(`Loading ${item.name}...`, { isLoadingState: true });
    const payload = await fetchJson(
      `/api/library/item?scope=${item.scope}&name=${encodeURIComponent(item.name)}`,
    );
    updateSvg(payload.svg);

    currentAssetName = payload.name;
    currentAssetScope = payload.scope;
    currentPrompt = payload.meta.prompt || "";
    currentCategory = payload.meta.category || "";
    currentPromptMode = payload.meta.promptMode || null;
    currentPromptIndex = null;
    currentPromptCount = null;
    currentSeed = null;
    currentGenerationConfig = payload?.meta?.generationConfig || null;

    promptEl.textContent = currentPrompt || "(No saved prompt metadata for this SVG)";
    renderMeta();
    renderModelMeta({
      model: payload.meta.model,
      generationConfig: payload?.meta?.generationConfig || null,
    });
    renderModelResponse("");
    syncCarouselFromCurrentSelection();
    renderCarouselControls();
    renderParallelResults();
    refreshControlStates();
    renderLibraryList({
      scope: libraryScope,
      items: libraryItems,
      archivedCount: libraryArchivedCount,
    });
    setStatus(`Loaded ${payload.name}.`);
  } catch (error) {
    setStatus(error.message, { isError: true });
  }
}

async function hideLibraryItem(name) {
  try {
    setStatus(`Hiding ${name}...`, { isLoadingState: true });
    const payload = await fetchJson("/api/library/hide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (currentAssetName === name && currentAssetScope === "created") {
      currentAssetScope = "archived";
      currentAssetName = payload.moved.name;
      renderMeta();
    }
    await loadLibrary();
    setStatus(`Hidden ${name}.`);
  } catch (error) {
    setStatus(error.message, { isError: true });
  }
}

async function unhideLibraryItem(name) {
  try {
    setStatus(`Unhiding ${name}...`, { isLoadingState: true });
    const payload = await fetchJson("/api/library/unhide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (currentAssetName === name && currentAssetScope === "archived") {
      currentAssetScope = "created";
      currentAssetName = payload.moved.name;
      renderMeta();
    }
    await loadLibrary();
    setStatus(`Unhidden ${name}.`);
  } catch (error) {
    setStatus(error.message, { isError: true });
  }
}

async function deleteLibraryItem(name, scope) {
  const activeScope = scope === "archived" ? "archived" : "created";
  const confirmed = window.confirm(`Delete ${name} from ${activeScope}? This cannot be undone.`);
  if (!confirmed) {
    return;
  }

  try {
    setStatus(`Deleting ${name}...`, { isLoadingState: true });
    await fetchJson("/api/library/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, scope: activeScope }),
    });
    if (currentAssetName === name && currentAssetScope === activeScope) {
      currentAssetName = null;
      currentAssetScope = null;
      renderMeta();
    }
    await loadLibrary();
    setStatus(`Deleted ${name}.`);
  } catch (error) {
    setStatus(error.message, { isError: true });
  }
}

function withGenerationConfig(payload) {
  const generationConfig = getGenerationConfig();
  currentGenerationConfig = generationConfig;
  return {
    ...payload,
    maxOutputTokens: generationConfig.maxOutputTokens,
    thinkingLevel: generationConfig.thinkingLevel,
  };
}

async function generateNextFromServer() {
  const model = getSelectedModel();
  try {
    setLoading(true);
    clearParallelResults();
    setStatus("Selecting next preset prompt...", { isLoadingState: true });
    const selection = await fetchJson("/api/next-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withGenerationConfig({ model })),
    });
    applyPromptSelection(selection);

    setStatus("Generating selected prompt...", { isLoadingState: true });
    const payload = await fetchJson("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withGenerationConfig({
        prompt: selection.prompt,
        category: selection.category,
        seed: selection.seed,
        promptIndex: selection.promptIndex,
        promptCount: selection.promptCount,
        promptMode: selection.promptMode,
        model,
      })),
    });
    applyGenerationPayload(payload);
    await loadLibrary();
    setStatus(currentAssetName ? `Done. Saved ${currentAssetName}.` : "Done.");
  } catch (error) {
    if (error?.payload && Object.prototype.hasOwnProperty.call(error.payload, "prompt")) {
      applyPromptSelection(error.payload);
    }
    setStatus(error.message, { isError: true });
  } finally {
    setLoading(false);
  }
}

async function generateSelected() {
  if (generationMode !== "examples") {
    setStatus("Switch to Examples mode to generate selected prompts.", { isError: true });
    return;
  }

  const model = getSelectedModel();
  const selection = getSelectedFixedPrompt();

  if (!selection) {
    await generateNextFromServer();
    return;
  }

  try {
    setLoading(true);
    clearParallelResults();
    setStatus(`Generating prompt ${selection.promptIndex + 1}/${selection.promptCount}...`, {
      isLoadingState: true,
    });
    const payload = await fetchJson("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withGenerationConfig({
        prompt: selection.prompt,
        category: selection.category,
        seed: selection.seed,
        promptIndex: selection.promptIndex,
        promptCount: selection.promptCount,
        promptMode: selection.promptMode,
        model,
      })),
    });
    applyGenerationPayload(payload);
    await loadLibrary();
    setStatus(currentAssetName ? `Done. Saved ${currentAssetName}.` : "Done.");
  } catch (error) {
    setStatus(error.message, { isError: true });
  } finally {
    setLoading(false);
  }
}

async function generateParallel() {
  if (generationMode !== "examples") {
    setStatus("Switch to Examples mode to run parallel generation.", { isError: true });
    return;
  }

  if (!fixedPrompts.length || !Number.isInteger(selectedFixedPromptIndex)) {
    setStatus("Parallel mode requires fixed prompt mode.", { isError: true });
    return;
  }

  const count = clampParallelCount();
  const model = getSelectedModel();
  const selections = [];
  for (let offset = 0; offset < count; offset += 1) {
    const index = normalizeFixedPromptIndex(selectedFixedPromptIndex + offset);
    if (!Number.isInteger(index)) {
      continue;
    }
    const selection = fixedPrompts[index];
    if (selection) {
      selections.push(selection);
    }
  }

  if (!selections.length) {
    setStatus("No prompts selected for parallel generation.", { isError: true });
    return;
  }

  try {
    setLoading(true);
    parallelResultItems = [];
    renderParallelResults();
    setStatus(`Generating ${selections.length} prompts in parallel...`, { isLoadingState: true });
    const responses = await Promise.allSettled(
      selections.map((selection) =>
        fetchJson("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(withGenerationConfig({
            prompt: selection.prompt,
            category: selection.category,
            seed: selection.seed,
            promptIndex: selection.promptIndex,
            promptCount: selection.promptCount,
            promptMode: selection.promptMode,
            model,
          })),
        }),
      ),
    );

    const successes = responses
      .map((result, index) =>
        result.status === "fulfilled"
          ? {
              index,
              payload: result.value,
            }
          : null,
      )
      .filter(Boolean);
    const failures = responses
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason);

    if (successes.length > 0) {
      parallelResultItems = successes;
      applyGenerationPayload(successes[0].payload);
      renderParallelResults();
      await loadLibrary();
    }

    if (successes.length === 0) {
      setStatus("Parallel generation failed for all selected prompts.", { isError: true });
      return;
    }

    if (failures.length === 0) {
      setStatus(
        `Done. Generated ${successes.length} SVG${successes.length === 1 ? "" : "s"}. Use Parallel Results to inspect each one.`,
      );
      return;
    }

    const firstError = failures[0] instanceof Error ? failures[0].message : "Unknown error.";
    const summary = `Generated ${successes.length}/${selections.length}. First failure: ${firstError}`;
    setStatus(summary, { isError: true });
  } catch (error) {
    setStatus(error.message, { isError: true });
  } finally {
    setLoading(false);
  }
}

async function generateCustom() {
  if (generationMode !== "custom") {
    setStatus("Switch to Custom mode to generate from a custom prompt.", { isError: true });
    return;
  }

  const prompt = getCustomPromptValue();
  if (!prompt) {
    setStatus("Enter a custom prompt first.", { isError: true });
    return;
  }

  try {
    setLoading(true);
    clearParallelResults();
    setStatus("Generating from custom prompt...", { isLoadingState: true });
    const payload = await fetchJson("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withGenerationConfig({
        prompt,
        model: getSelectedModel(),
        category: "custom",
        promptMode: composePromptMode,
      })),
    });
    applyGenerationPayload(payload);
    await loadLibrary();
    setStatus(currentAssetName ? `Done. Saved ${currentAssetName}.` : "Done.");
  } catch (error) {
    setStatus(error.message, { isError: true });
  } finally {
    setLoading(false);
  }
}

async function createFromPastedSvg() {
  if (generationMode !== "paste") {
    setStatus("Switch to Paste SVG mode to create from pasted markup.", { isError: true });
    return;
  }

  const svg = getPastedSvgValue();
  if (!svg) {
    setStatus("Paste SVG markup first.", { isError: true });
    return;
  }

  try {
    setLoading(true);
    clearParallelResults();
    setStatus("Creating SVG from pasted markup...", { isLoadingState: true });
    const payload = await fetchJson("/api/create-from-svg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        svg,
        prompt: getPastedLabelValue(),
      }),
    });
    applyGenerationPayload(payload);
    if (Array.isArray(payload.preprocessNotes) && payload.preprocessNotes.length > 0) {
      setPasteMeta(payload.preprocessNotes.join(" "));
    } else {
      setPasteMeta("Imported without modifications.");
    }
    await loadLibrary();
    setStatus(currentAssetName ? `Done. Saved ${currentAssetName}.` : "Done.");
  } catch (error) {
    setStatus(error.message, { isError: true });
  } finally {
    setLoading(false);
  }
}

async function polishPrompt() {
  if (generationMode !== "custom") {
    setStatus("Switch to Custom mode to polish a prompt.", { isError: true });
    return;
  }

  const prompt = getCustomPromptValue();
  if (!prompt) {
    setStatus("Enter a prompt to polish first.", { isError: true });
    return;
  }

  try {
    setLoading(true);
    setStatus("Polishing prompt...", { isLoadingState: true });
    const payload = await fetchJson("/api/polish-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withGenerationConfig({
        prompt,
        model: getSelectedModel(),
        polishPromptTemplate: getPolishPromptTemplate(),
      })),
    });
    customPromptInput.value = payload.prompt || prompt;
    composePromptMode = "custom-polished";
    const usedCustomTemplate = Boolean(payload.usedCustomTemplate);
    setCustomMeta(
      usedCustomTemplate
        ? `Polished with ${payload.model} using custom template.`
        : `Polished with ${payload.model}.`,
    );
    setStatus(
      usedCustomTemplate
        ? "Prompt polished with custom template. Generate custom when ready."
        : "Prompt polished. Generate custom when ready.",
    );
  } catch (error) {
    setStatus(error.message, { isError: true });
  } finally {
    setLoading(false);
  }
}

async function savePrompt() {
  if (!currentPrompt) {
    return;
  }

  try {
    setLoading(true);
    setStatus("Saving prompt...", { isLoadingState: true });
    const payload = await fetchJson("/api/save-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: currentPrompt,
        promptMode: currentPromptMode,
        category: currentCategory,
        promptIndex: currentPromptIndex,
        promptCount: currentPromptCount,
        seed: currentSeed,
      }),
    });
    setStatus(`Saved to ${payload.file}`);
  } catch (error) {
    setStatus(error.message, { isError: true });
  } finally {
    setLoading(false);
  }
}

async function copyPrompt() {
  if (!currentPrompt) {
    return;
  }

  try {
    await navigator.clipboard.writeText(currentPrompt);
    setStatus("Prompt copied to clipboard.");
  } catch {
    setStatus("Clipboard copy failed.", { isError: true });
  }
}

async function copyCurrentSvg() {
  if (!currentSvgText) {
    return;
  }
  if (!navigator.clipboard?.writeText) {
    setCopySvgFeedback("copy failed", { isError: true });
    setStatus("SVG copy failed.", { isError: true });
    return;
  }

  try {
    await navigator.clipboard.writeText(currentSvgText);
    setCopySvgFeedback("copied");
    setStatus("SVG copied to clipboard.");
  } catch {
    setCopySvgFeedback("copy failed", { isError: true });
    setStatus("SVG copy failed.", { isError: true });
  }
}

async function exportCurrentSvgForDiscord() {
  if (!currentSvgText) {
    setStatus("Generate or load an SVG first.", { isError: true });
    return;
  }

  try {
    setLoading(true);
    setDiscordExportFeedback(`exporting to Discord... ${DISCORD_EXPORT_TIME_HINT.toLowerCase()}`);
    setStatus(`Exporting to Discord... ${DISCORD_EXPORT_TIME_HINT}`, { isLoadingState: true });
    const presetId = getSelectedDiscordExportPresetId();
    const payload = await fetchJson("/api/discord-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        presetId,
        sourceName: currentAssetName || "animated-svg.svg",
        svg: currentSvgText,
      }),
    });

    const base64 = payload?.output?.base64;
    const mimeType = payload?.output?.mimeType;
    const fileName = payload?.output?.fileName || "discord-export.bin";
    if (typeof base64 !== "string" || base64.length === 0) {
      throw new Error("Export completed but no downloadable file was returned.");
    }

    const blob = base64ToBlob(base64, mimeType);
    downloadBlob(blob, fileName);

    const bytes = Number(payload?.output?.bytes) || blob.size;
    const limit = Number(payload?.preset?.sizeLimitBytes) || 0;
    const withinLimit = payload?.output?.meetsDiscordLimit !== false;
    const summary = limit > 0 ? `${bytesToLabel(bytes)} / ${bytesToLabel(limit)}` : bytesToLabel(bytes);

    if (withinLimit) {
      setDiscordExportFeedback(`export to Discord downloaded (${summary}). ${DISCORD_EXPORT_TIME_HINT}`);
      setStatus(`Export to Discord ready: ${fileName}. ${DISCORD_EXPORT_TIME_HINT}`);
    } else {
      setDiscordExportFeedback(`export to Discord downloaded (over limit: ${summary}). ${DISCORD_EXPORT_TIME_HINT}`, {
        isError: true,
      });
      const warning =
        payload?.output?.warning || "Export to Discord downloaded, but it exceeds Discord size limits.";
      setStatus(`${warning} ${DISCORD_EXPORT_TIME_HINT}`, { isError: true });
    }
  } catch (error) {
    const errorMessage = error?.message || "Export to Discord failed.";
    setDiscordExportFeedback(`export to Discord failed. ${DISCORD_EXPORT_TIME_HINT}`, { isError: true });
    setStatus(`${errorMessage} ${DISCORD_EXPORT_TIME_HINT}`, { isError: true });
  } finally {
    setLoading(false);
  }
}

function useCurrentPromptInComposer() {
  if (!currentPrompt) {
    return;
  }
  customPromptInput.value = currentPrompt;
  composePromptMode = currentPromptMode === "custom-polished" ? "custom-polished" : "custom";
  applyGenerationMode("custom");
  setCustomMeta("Loaded current prompt into custom editor.");
  refreshControlStates();
}

function isTypingTarget(target) {
  if (!target) {
    return false;
  }
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

nextButton.addEventListener("click", generateSelected);
prevPromptButton.addEventListener("click", () => cycleFixedPrompt(-1));
nextPromptButton.addEventListener("click", () => cycleFixedPrompt(1));
parallelButton.addEventListener("click", generateParallel);
saveButton.addEventListener("click", savePrompt);
copyButton.addEventListener("click", copyPrompt);
if (copySvgButton) {
  copySvgButton.addEventListener("click", copyCurrentSvg);
}
if (discordExportButton) {
  discordExportButton.addEventListener("click", exportCurrentSvgForDiscord);
}
polishButton.addEventListener("click", polishPrompt);
generateCustomButton.addEventListener("click", generateCustom);
if (createFromSvgButton) {
  createFromSvgButton.addEventListener("click", createFromPastedSvg);
}
useCurrentButton.addEventListener("click", useCurrentPromptInComposer);
if (openPasteModeButton) {
  openPasteModeButton.addEventListener("click", () => {
    applyGenerationMode("paste");
    setStatus("Switched to paste mode. Paste SVG markup and create.");
  });
}
refreshLibraryButton.addEventListener("click", () => loadLibrary());
showHiddenToggle.addEventListener("change", () => loadLibrary({ preserveSelection: false }));
if (generationModeSelect) {
  generationModeSelect.addEventListener("change", () => {
    applyGenerationMode(generationModeSelect.value);
    const label =
      generationMode === "custom" ? "custom" : generationMode === "paste" ? "paste" : "examples";
    setStatus(`Switched to ${label} mode.`);
  });
}
promptSelect.addEventListener("change", () => {
  const raw = Number.parseInt(String(promptSelect.value || ""), 10);
  if (Number.isInteger(raw)) {
    setSelectedFixedPrompt(raw);
  }
});
parallelCountInput.addEventListener("change", () => {
  clampParallelCount();
  refreshControlStates();
});
if (maxTokensInput) {
  maxTokensInput.addEventListener("blur", () => {
    getMaxOutputTokens();
    renderModelMeta({ model: getSelectedModel(), generationConfig: getGenerationConfig() });
  });
}
if (reasoningLevelSelect) {
  reasoningLevelSelect.addEventListener("change", () => {
    renderModelMeta({ model: getSelectedModel(), generationConfig: getGenerationConfig() });
  });
}
if (cutModeSelect) {
  cutModeSelect.addEventListener("change", () => {
    applyCutMode();
  });
}
if (cutRatioInput) {
  cutRatioInput.addEventListener("input", () => {
    applyCutMode();
  });
  cutRatioInput.addEventListener("change", () => {
    applyCutMode();
  });
  cutRatioInput.addEventListener("blur", () => {
    applyCutMode();
  });
}
if (themeSelect) {
  themeSelect.addEventListener("change", () => {
    const theme = normalizeTheme(themeSelect.value);
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage failures and keep the active in-memory theme.
    }
  });
}
if (carouselNewestButton) {
  carouselNewestButton.addEventListener("click", () => navigateCarousel("newest"));
}
if (carouselNewerButton) {
  carouselNewerButton.addEventListener("click", () => navigateCarousel("newer"));
}
if (carouselOlderButton) {
  carouselOlderButton.addEventListener("click", () => navigateCarousel("older"));
}
if (carouselOldestButton) {
  carouselOldestButton.addEventListener("click", () => navigateCarousel("oldest"));
}

customPromptInput.addEventListener("input", () => {
  if (composePromptMode !== "custom") {
    composePromptMode = "custom";
    setCustomMeta("");
  }
  refreshControlStates();
});

if (pasteSvgInput) {
  pasteSvgInput.addEventListener("input", () => {
    setPasteMeta("");
    refreshControlStates();
  });
}

if (pasteLabelInput) {
  pasteLabelInput.addEventListener("input", () => {
    setPasteMeta("");
  });
}

if (modelInput) {
  modelInput.addEventListener("blur", () => {
    if (!String(modelInput.value || "").trim()) {
      modelInput.value = DEFAULT_MODEL;
    }
    renderModelMeta({ model: getSelectedModel(), generationConfig: getGenerationConfig() });
  });
}
if (resetPolishTemplateButton) {
  resetPolishTemplateButton.addEventListener("click", () => {
    resetPolishTemplate();
    setStatus("Polish template reset to default.");
  });
}

customPromptInput.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    if (!generateCustomButton.disabled) {
      generateCustom();
    }
  }
});

if (pasteSvgInput) {
  pasteSvgInput.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      if (!createFromSvgButton?.disabled) {
        createFromPastedSvg();
      }
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (
    event.defaultPrevented ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey ||
    isTypingTarget(event.target)
  ) {
    return;
  }

  if (event.key.toLowerCase() === "n") {
    event.preventDefault();
    if (generationMode === "examples" && !nextPromptButton.disabled) {
      cycleFixedPrompt(1);
    }
  }

  if (event.key.toLowerCase() === "g") {
    event.preventDefault();
    if (generationMode === "custom") {
      if (!generateCustomButton.disabled) {
        generateCustom();
      }
      return;
    }
    if (generationMode === "paste") {
      if (!createFromSvgButton?.disabled) {
        createFromPastedSvg();
      }
      return;
    }
    if (!nextButton.disabled) {
      generateSelected();
    }
  }
});

loadThemePreference();
currentGenerationConfig = getGenerationConfig();
applyGenerationMode("examples");
applyCutMode();
renderParallelResults();
renderCarouselControls();
renderModelMeta({ model: getSelectedModel(), generationConfig: currentGenerationConfig });
loadPolishTemplateConfig().catch(() => {
  // Keep UI usable even when config fetch fails.
});
loadLibrary();
loadFixedPrompts().catch((error) => {
  setStatus(`Prompt list load failed: ${error.message}`, { isError: true });
  refreshControlStates();
});
loadDiscordExportPresets().catch(() => {
  // Keep UI usable with static preset fallback.
});
