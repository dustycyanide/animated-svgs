const nextButton = document.getElementById("next-btn");
const saveButton = document.getElementById("save-btn");
const copyButton = document.getElementById("copy-btn");
const polishButton = document.getElementById("polish-btn");
const generateCustomButton = document.getElementById("generate-custom-btn");
const useCurrentButton = document.getElementById("use-current-btn");
const modelInput = document.getElementById("model-input");
const refreshLibraryButton = document.getElementById("refresh-library-btn");
const showHiddenToggle = document.getElementById("show-hidden-toggle");
const customPromptInput = document.getElementById("custom-prompt-input");
const customMetaEl = document.getElementById("custom-meta");
const statusEl = document.getElementById("status");
const promptEl = document.getElementById("prompt");
const categoryEl = document.getElementById("category");
const modelMetaEl = document.getElementById("model-meta");
const viewerEl = document.getElementById("svg-viewer");
const viewerEmptyEl = document.getElementById("viewer-empty");
const modelDetailsEl = document.getElementById("model-details");
const modelSummaryEl = document.getElementById("model-summary");
const modelResponseEl = document.getElementById("model-response");
const libraryMetaEl = document.getElementById("library-meta");
const libraryListEl = document.getElementById("library-list");

let currentPrompt = "";
let currentCategory = "";
let currentSeed = null;
let currentPromptIndex = null;
let currentPromptCount = null;
let currentPromptMode = null;
let currentSvgUrl = null;
let currentAssetName = null;
let currentAssetScope = null;

let composePromptMode = "custom";
const DEFAULT_MODEL = "gemini-3.1-pro-preview";

let libraryScope = "created";
let libraryItems = [];
let libraryArchivedCount = 0;

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

function setCustomMeta(message = "") {
  customMetaEl.textContent = message;
}

function getSelectedModel() {
  const value = String(modelInput?.value || "").trim();
  return value || DEFAULT_MODEL;
}

function refreshControlStates() {
  const hasCurrentPrompt = Boolean(currentPrompt);
  const hasCustomPrompt = Boolean(getCustomPromptValue());

  nextButton.disabled = isLoading;
  saveButton.disabled = isLoading || !hasCurrentPrompt;
  copyButton.disabled = isLoading || !hasCurrentPrompt;
  useCurrentButton.disabled = isLoading || !hasCurrentPrompt;
  polishButton.disabled = isLoading || !hasCustomPrompt;
  generateCustomButton.disabled = isLoading || !hasCustomPrompt;
  customPromptInput.disabled = isLoading;
  if (modelInput) {
    modelInput.disabled = isLoading;
  }

  refreshLibraryButton.disabled = isLibraryLoading;
  showHiddenToggle.disabled = isLibraryLoading;
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
  if (currentSvgUrl) {
    URL.revokeObjectURL(currentSvgUrl);
  }
  const blob = new Blob([svgText], { type: "image/svg+xml" });
  currentSvgUrl = URL.createObjectURL(blob);
  viewerEl.data = currentSvgUrl;
  viewerEl.parentElement.classList.add("has-content");
  if (viewerEmptyEl) {
    viewerEmptyEl.textContent = "No SVG yet. Click Next to generate one.";
  }
}

function clearSvg(message = "No SVG yet. Click Next to generate one.") {
  if (currentSvgUrl) {
    URL.revokeObjectURL(currentSvgUrl);
    currentSvgUrl = null;
  }
  viewerEl.removeAttribute("data");
  viewerEl.parentElement.classList.remove("has-content");
  if (viewerEmptyEl) {
    viewerEmptyEl.textContent = message;
  }
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
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
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
        ? "No created SVGs yet. Click Next or Generate Custom."
        : "No hidden SVGs.";
    libraryListEl.appendChild(empty);
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

    const moveButton = document.createElement("button");
    moveButton.type = "button";
    moveButton.className = "btn btn-ghost btn-mini";
    moveButton.textContent = item.scope === "created" ? "Hide" : "Unhide";
    moveButton.addEventListener("click", () => {
      if (item.scope === "created") {
        hideLibraryItem(item.name);
      } else {
        unhideLibraryItem(item.name);
      }
    });
    actionWrap.appendChild(moveButton);

    row.appendChild(textWrap);
    row.appendChild(actionWrap);
    libraryListEl.appendChild(row);
  }
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
      if (!hasCurrent && payload.scope === "created" && currentAssetScope === "created") {
        currentAssetName = null;
        currentAssetScope = null;
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

  promptEl.textContent = currentPrompt;
  renderMeta();
  renderModelMeta(payload);
  renderModelResponse(payload.rawModelResponse);

  if (payload.svg) {
    updateSvg(payload.svg);
  } else {
    clearSvg("No SVG was returned for this run.");
  }
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

    promptEl.textContent = currentPrompt || "(No saved prompt metadata for this SVG)";
    renderMeta();
    renderModelMeta({ model: payload.meta.model });
    renderModelResponse("");
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

async function nextRandom() {
  try {
    setLoading(true);
    setStatus("Generating next preset prompt...", { isLoadingState: true });
    const payload = await fetchJson("/api/next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: getSelectedModel() }),
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

async function generateCustom() {
  const prompt = getCustomPromptValue();
  if (!prompt) {
    setStatus("Enter a custom prompt first.", { isError: true });
    return;
  }

  try {
    setLoading(true);
    setStatus("Generating from custom prompt...", { isLoadingState: true });
    const payload = await fetchJson("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        model: getSelectedModel(),
        category: "custom",
        promptMode: composePromptMode,
      }),
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

async function polishPrompt() {
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
      body: JSON.stringify({
        prompt,
        model: getSelectedModel(),
      }),
    });
    customPromptInput.value = payload.prompt || prompt;
    composePromptMode = "custom-polished";
    setCustomMeta(`Polished with ${payload.model}.`);
    setStatus("Prompt polished. Generate custom when ready.");
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

function useCurrentPromptInComposer() {
  if (!currentPrompt) {
    return;
  }
  customPromptInput.value = currentPrompt;
  composePromptMode = currentPromptMode === "custom-polished" ? "custom-polished" : "custom";
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

nextButton.addEventListener("click", nextRandom);
saveButton.addEventListener("click", savePrompt);
copyButton.addEventListener("click", copyPrompt);
polishButton.addEventListener("click", polishPrompt);
generateCustomButton.addEventListener("click", generateCustom);
useCurrentButton.addEventListener("click", useCurrentPromptInComposer);
refreshLibraryButton.addEventListener("click", () => loadLibrary());
showHiddenToggle.addEventListener("change", () => loadLibrary({ preserveSelection: false }));

customPromptInput.addEventListener("input", () => {
  if (composePromptMode !== "custom") {
    composePromptMode = "custom";
    setCustomMeta("");
  }
  refreshControlStates();
});

if (modelInput) {
  modelInput.addEventListener("blur", () => {
    if (!String(modelInput.value || "").trim()) {
      modelInput.value = DEFAULT_MODEL;
    }
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
    if (!nextButton.disabled) {
      nextRandom();
    }
  }
});

refreshControlStates();
loadLibrary();
