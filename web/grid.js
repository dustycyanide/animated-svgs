const gridPageEl = document.querySelector(".grid-page");
const gridEl = document.getElementById("svg-grid");
const statusEl = document.getElementById("grid-status");
const metaEl = document.getElementById("grid-meta");
const refreshButton = document.getElementById("refresh-grid-btn");
const includeHiddenToggle = document.getElementById("include-hidden-toggle");
const cutModeSelect = document.getElementById("grid-cut-mode-select");
const cutRatioInput = document.getElementById("grid-cut-ratio-input");
const themeSelect = document.getElementById("grid-theme-select");
const discordExportPresetSelect = document.getElementById("grid-discord-export-preset");

const detailPanelEl = document.getElementById("svg-detail-panel");
const detailTitleEl = document.getElementById("detail-title");
const detailSubEl = document.getElementById("detail-sub");
const detailBackButton = document.getElementById("detail-back-btn");
const detailCopyButton = document.getElementById("detail-copy-btn");
const detailDiscordExportButton = document.getElementById("detail-discord-export-btn");
const detailDownloadLink = document.getElementById("detail-download-link");
const detailRawLink = document.getElementById("detail-raw-link");
const detailCopyFeedbackEl = document.getElementById("detail-copy-feedback");
const detailDiscordExportFeedbackEl = document.getElementById("detail-discord-export-feedback");
const detailViewerStageEl = document.getElementById("detail-viewer-stage");
const detailViewerEl = document.getElementById("detail-viewer");
const detailEmptyEl = document.getElementById("detail-empty");

const ALLOWED_CUT_MODES = new Set(["original", "square", "circle", "ratio"]);
const ALLOWED_SCOPES = new Set(["created", "archived"]);
const THEME_STORAGE_KEY = "animated-svgs-theme";
const DISCORD_EXPORT_TIME_HINT = "Export to Discord can take up to 2 minutes.";

let allLibraryItems = [];
let gridSummary = {
  visibleCount: 0,
  createdCount: 0,
  archivedCount: 0,
  includeHidden: false,
};
let currentDetail = null;
let detailRequestToken = 0;
let discordExportPresets = [];
let isExportingDiscord = false;

function setStatus(message, { isError = false } = {}) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function compact(text, max = 92) {
  const value = String(text || "").trim().replace(/\s+/g, " ");
  if (!value) {
    return "";
  }
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
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

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 120000;
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetchJson(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error && error.name === "AbortError") {
      const seconds = Math.round(timeout / 1000);
      throw new Error(`Request timed out after ${seconds}s.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function getDefaultDiscordExportPresets() {
  return [
    { id: "attachment-webp", label: "Chat Attachment (Animated WebP)", sizeLimitBytes: 10 * 1024 * 1024 },
    { id: "emoji-webp", label: "Server Emoji (Animated WebP)", sizeLimitBytes: 256 * 1024 },
    { id: "emoji-gif", label: "Server Emoji (GIF)", sizeLimitBytes: 256 * 1024 },
    { id: "sticker-apng", label: "Sticker (APNG)", sizeLimitBytes: 512 * 1024 },
  ];
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

function normalizeCutMode(rawMode) {
  const mode = String(rawMode || "original").toLowerCase();
  if (!ALLOWED_CUT_MODES.has(mode)) {
    return "original";
  }
  return mode;
}

function normalizeScope(rawScope) {
  const scope = String(rawScope || "created").toLowerCase();
  if (!ALLOWED_SCOPES.has(scope)) {
    return "created";
  }
  return scope;
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

function getSelectedDiscordExportPresetId() {
  const selectedId = String(discordExportPresetSelect?.value || "").trim();
  if (!selectedId) {
    return "attachment-webp";
  }
  return selectedId;
}

function setDetailDiscordExportFeedback(message = "", { isError = false } = {}) {
  if (!detailDiscordExportFeedbackEl) {
    return;
  }
  detailDiscordExportFeedbackEl.textContent = message;
  detailDiscordExportFeedbackEl.classList.toggle("error", isError);
}

function refreshDiscordExportControlStates() {
  const hasPresets = discordExportPresets.length > 0;
  if (discordExportPresetSelect) {
    discordExportPresetSelect.disabled = isExportingDiscord || !hasPresets;
  }
  if (detailDiscordExportButton) {
    detailDiscordExportButton.disabled = isExportingDiscord || !hasPresets || !currentDetail?.svg;
  }
  for (const exportButton of document.querySelectorAll(".card-export-discord-btn")) {
    exportButton.disabled = isExportingDiscord || !hasPresets;
  }
}

function setDiscordExportLoading(nextLoading) {
  isExportingDiscord = Boolean(nextLoading);
  refreshDiscordExportControlStates();
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
  refreshDiscordExportControlStates();
}

function applyCutClass(targetEl, mode, ratio) {
  if (!targetEl) {
    return;
  }
  targetEl.classList.remove("cut-mode-square", "cut-mode-circle", "cut-mode-ratio");

  if (mode === "square") {
    targetEl.classList.add("cut-mode-square");
  } else if (mode === "circle") {
    targetEl.classList.add("cut-mode-circle");
  } else if (mode === "ratio") {
    targetEl.classList.add("cut-mode-ratio");
    targetEl.style.setProperty("--grid-cut-ratio", String(ratio || 16 / 9));
  }
}

function applyGridCutMode() {
  const mode = normalizeCutMode(cutModeSelect?.value);
  const ratio = parseRatioValue(cutRatioInput?.value || "");
  applyCutClass(gridEl, mode, ratio);
  applyCutClass(detailViewerStageEl, mode, ratio);
}

function applyCutSettingsFromUrl() {
  const url = new URL(window.location.href);
  const mode = normalizeCutMode(url.searchParams.get("cut"));
  const ratio = String(url.searchParams.get("ratio") || "").trim();

  if (cutModeSelect) {
    cutModeSelect.value = mode;
  }
  if (cutRatioInput && ratio) {
    cutRatioInput.value = ratio;
  }
}

function getDetailFromUrl() {
  const url = new URL(window.location.href);
  if (url.searchParams.get("view") !== "detail") {
    return null;
  }

  const name = String(url.searchParams.get("name") || "").trim();
  if (!name) {
    return null;
  }

  return {
    scope: normalizeScope(url.searchParams.get("scope")),
    name,
  };
}

function syncUrlState({ push = false } = {}) {
  const url = new URL(window.location.href);
  const mode = normalizeCutMode(cutModeSelect?.value);
  const ratioText = String(cutRatioInput?.value || "").trim();

  if (mode === "original") {
    url.searchParams.delete("cut");
    url.searchParams.delete("ratio");
  } else {
    url.searchParams.set("cut", mode);
    if (mode === "ratio" && parseRatioValue(ratioText)) {
      url.searchParams.set("ratio", ratioText);
    } else {
      url.searchParams.delete("ratio");
    }
  }

  if (currentDetail) {
    url.searchParams.set("view", "detail");
    url.searchParams.set("scope", currentDetail.scope);
    url.searchParams.set("name", currentDetail.name);
  } else {
    url.searchParams.delete("view");
    url.searchParams.delete("scope");
    url.searchParams.delete("name");
  }

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  if (push) {
    window.history.pushState({}, "", nextUrl);
    return;
  }
  window.history.replaceState({}, "", nextUrl);
}

function createGenerateLink(label) {
  const link = document.createElement("a");
  link.className = "btn btn-primary";
  link.href = "/generate";

  const plus = document.createElement("span");
  plus.className = "btn-plus";
  plus.setAttribute("aria-hidden", "true");
  plus.textContent = "+";

  const text = document.createElement("span");
  text.textContent = label;

  link.appendChild(plus);
  link.appendChild(text);
  return link;
}

function createGenerateCard() {
  const card = document.createElement("article");
  card.className = "card card-generate";

  const body = document.createElement("div");
  body.className = "card-generate-body";

  const plus = document.createElement("div");
  plus.className = "card-generate-plus";
  plus.setAttribute("aria-hidden", "true");
  plus.textContent = "+";

  const title = document.createElement("p");
  title.className = "card-title";
  title.textContent = "Need another SVG?";

  const sub = document.createElement("p");
  sub.className = "card-sub";
  sub.textContent = "Open the generator and create a fresh animation.";

  const actions = document.createElement("div");
  actions.className = "card-actions";
  actions.appendChild(createGenerateLink("Generate SVG"));

  body.appendChild(plus);
  body.appendChild(title);
  body.appendChild(sub);
  body.appendChild(actions);
  card.appendChild(body);
  return card;
}

function setDetailVisibility(show) {
  if (detailPanelEl) {
    detailPanelEl.hidden = !show;
  }
  if (gridPageEl) {
    gridPageEl.classList.toggle("detail-open", show);
  }
}

function setDetailCopyFeedback(message, { isError = false } = {}) {
  if (!detailCopyFeedbackEl) {
    return;
  }
  detailCopyFeedbackEl.textContent = message;
  detailCopyFeedbackEl.classList.toggle("error", isError);
}

function setGridSummary(createdCount, archivedCount, includeHidden) {
  const visibleCount = includeHidden ? createdCount + archivedCount : createdCount;
  gridSummary = {
    visibleCount,
    createdCount,
    archivedCount,
    includeHidden,
  };

  metaEl.textContent = includeHidden
    ? `${visibleCount} total (${createdCount} created, ${archivedCount} hidden)`
    : `${visibleCount} created (${archivedCount} hidden not shown)`;
}

function renderGridStatus() {
  const { visibleCount, includeHidden } = gridSummary;
  if (visibleCount === 0) {
    setStatus("No SVGs yet. Use + Generate SVG to create your first one.");
    return;
  }
  if (currentDetail) {
    setStatus(`Viewing ${currentDetail.name}.`);
    return;
  }
  const suffix = includeHidden ? " (including hidden)" : "";
  setStatus(`Loaded ${visibleCount} SVG${visibleCount === 1 ? "" : "s"}${suffix}.`);
}

function clearDetailUi() {
  if (detailTitleEl) {
    detailTitleEl.textContent = "Selected SVG";
  }
  if (detailSubEl) {
    detailSubEl.textContent = "Open an item from the grid to inspect it here.";
  }
  if (detailViewerEl) {
    detailViewerEl.removeAttribute("data");
  }
  if (detailViewerStageEl) {
    detailViewerStageEl.classList.remove("has-content");
  }
  if (detailEmptyEl) {
    detailEmptyEl.textContent = "Loading SVG preview...";
  }
  if (detailCopyButton) {
    detailCopyButton.disabled = true;
  }
  if (detailDiscordExportButton) {
    detailDiscordExportButton.disabled = true;
  }
  if (detailDownloadLink) {
    detailDownloadLink.href = "#";
    detailDownloadLink.removeAttribute("download");
  }
  if (detailRawLink) {
    detailRawLink.href = "#";
  }
  setDetailCopyFeedback("");
  setDetailDiscordExportFeedback("");
  refreshDiscordExportControlStates();
}

function closeDetail({ syncUrl = true, pushUrl = false, preserveStatus = false } = {}) {
  currentDetail = null;
  detailRequestToken += 1;
  clearDetailUi();
  setDetailVisibility(false);
  if (syncUrl) {
    syncUrlState({ push: pushUrl });
  }
  renderGrid(allLibraryItems);
  refreshDiscordExportControlStates();
  if (!preserveStatus) {
    renderGridStatus();
  }
}

function renderGrid(items) {
  gridEl.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("article");
    empty.className = "empty";

    const title = document.createElement("p");
    title.className = "empty-title";
    title.textContent = "No SVGs in this view yet.";

    const sub = document.createElement("p");
    sub.className = "empty-sub";
    sub.textContent = "Use the button below to open the generator and create your first one.";

    const actions = document.createElement("div");
    actions.className = "empty-actions";
    actions.appendChild(createGenerateLink("Generate First SVG"));

    empty.appendChild(title);
    empty.appendChild(sub);
    empty.appendChild(actions);
    gridEl.appendChild(empty);
    gridEl.appendChild(createGenerateCard());
    refreshDiscordExportControlStates();
    return;
  }

  for (const item of items) {
    const card = document.createElement("article");
    card.className = "card";
    if (currentDetail && currentDetail.name === item.name && currentDetail.scope === item.scope) {
      card.classList.add("selected");
    }

    const preview = document.createElement("img");
    preview.className = "card-preview";
    preview.loading = "lazy";
    preview.alt = item.prompt ? compact(item.prompt, 70) : item.name;
    preview.src = `/api/library/file?scope=${encodeURIComponent(item.scope)}&name=${encodeURIComponent(item.name)}`;

    const body = document.createElement("div");
    body.className = "card-body";

    const title = document.createElement("p");
    title.className = "card-title";
    title.textContent = compact(item.prompt, 110) || item.name;

    const sub = document.createElement("p");
    sub.className = "card-sub";
    sub.textContent = [item.name, formatDateTime(item.createdAt), item.scope].join(" | ");

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "btn btn-secondary";
    openButton.textContent = "Open in Page";
    openButton.addEventListener("click", () => {
      openDetail({
        scope: item.scope,
        name: item.name,
      });
    });

    const rawLink = document.createElement("a");
    rawLink.className = "btn btn-ghost";
    rawLink.target = "_blank";
    rawLink.rel = "noopener noreferrer";
    rawLink.href = `/api/library/file?scope=${encodeURIComponent(item.scope)}&name=${encodeURIComponent(item.name)}`;
    rawLink.textContent = "Raw";

    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.className = "btn btn-ghost card-export-discord-btn";
    exportButton.textContent = "Export to Discord";
    exportButton.disabled = isExportingDiscord || discordExportPresets.length === 0;
    exportButton.addEventListener("click", () => {
      exportLibraryItemForDiscord({
        scope: item.scope,
        name: item.name,
      });
    });

    actions.appendChild(openButton);
    actions.appendChild(exportButton);
    actions.appendChild(rawLink);
    body.appendChild(title);
    body.appendChild(sub);
    body.appendChild(actions);
    card.appendChild(preview);
    card.appendChild(body);
    gridEl.appendChild(card);
  }

  gridEl.appendChild(createGenerateCard());
  refreshDiscordExportControlStates();
}

async function loadGrid() {
  try {
    setStatus("Loading library grid...");
    refreshButton.disabled = true;
    includeHiddenToggle.disabled = true;
    if (cutModeSelect) {
      cutModeSelect.disabled = true;
    }

    const [createdPayload, archivedPayload] = await Promise.all([
      fetchJson("/api/library?scope=created"),
      fetchJson("/api/library?scope=archived"),
    ]);

    const includeHidden = includeHiddenToggle.checked;
    allLibraryItems = includeHidden
      ? [...createdPayload.items, ...archivedPayload.items]
      : [...createdPayload.items];

    allLibraryItems.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    renderGrid(allLibraryItems);
    applyGridCutMode();
    setGridSummary(createdPayload.items.length, archivedPayload.items.length, includeHidden);
    renderGridStatus();
  } catch (error) {
    setStatus(error.message, { isError: true });
    metaEl.textContent = "";
  } finally {
    refreshButton.disabled = false;
    includeHiddenToggle.disabled = false;
    if (cutModeSelect) {
      cutModeSelect.disabled = false;
    }
    applyGridCutMode();
  }
}

async function openDetail({ scope, name, syncUrl = true, pushUrl = true } = {}) {
  const fileName = String(name || "").trim();
  if (!fileName) {
    return;
  }

  const activeScope = normalizeScope(scope);
  const token = detailRequestToken + 1;
  detailRequestToken = token;
  setDetailVisibility(true);
  setDetailCopyFeedback("");

  if (detailTitleEl) {
    detailTitleEl.textContent = fileName;
  }
  if (detailSubEl) {
    detailSubEl.textContent = `${activeScope} | Loading details...`;
  }
  if (detailEmptyEl) {
    detailEmptyEl.textContent = "Loading SVG preview...";
  }
  if (detailViewerStageEl) {
    detailViewerStageEl.classList.remove("has-content");
  }
  if (detailCopyButton) {
    detailCopyButton.disabled = true;
  }
  if (detailDiscordExportButton) {
    detailDiscordExportButton.disabled = true;
  }
  if (detailDownloadLink) {
    detailDownloadLink.href = "#";
    detailDownloadLink.removeAttribute("download");
  }
  if (detailRawLink) {
    detailRawLink.href = "#";
  }
  setDetailDiscordExportFeedback("");

  try {
    const payload = await fetchJson(
      `/api/library/item?scope=${encodeURIComponent(activeScope)}&name=${encodeURIComponent(fileName)}`,
    );
    if (token !== detailRequestToken) {
      return;
    }

    const fileUrl = `/api/library/file?scope=${encodeURIComponent(payload.scope)}&name=${encodeURIComponent(payload.name)}`;
    currentDetail = {
      scope: normalizeScope(payload.scope),
      name: payload.name,
      svg: typeof payload.svg === "string" ? payload.svg : "",
      prompt: payload.meta?.prompt || "",
      createdAt: payload.meta?.createdAt || null,
      url: fileUrl,
    };

    if (detailTitleEl) {
      detailTitleEl.textContent = compact(currentDetail.prompt, 120) || currentDetail.name;
    }
    if (detailSubEl) {
      detailSubEl.textContent = [
        currentDetail.name,
        formatDateTime(currentDetail.createdAt),
        currentDetail.scope,
      ].join(" | ");
    }
    if (detailViewerEl) {
      detailViewerEl.data = currentDetail.url;
    }
    if (detailViewerStageEl) {
      detailViewerStageEl.classList.add("has-content");
    }
    if (detailDownloadLink) {
      detailDownloadLink.href = currentDetail.url;
      detailDownloadLink.download = currentDetail.name;
    }
    if (detailRawLink) {
      detailRawLink.href = currentDetail.url;
    }
    if (detailCopyButton) {
      detailCopyButton.disabled = !currentDetail.svg;
    }
    refreshDiscordExportControlStates();
    applyGridCutMode();
    renderGrid(allLibraryItems);
    renderGridStatus();

    if (syncUrl) {
      syncUrlState({ push: pushUrl });
    }
  } catch (error) {
    if (token !== detailRequestToken) {
      return;
    }
    setStatus(error.message, { isError: true });
    closeDetail({ syncUrl, pushUrl: false, preserveStatus: true });
  }
}

function copyTextFallback(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "readonly");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);
  return ok;
}

async function copyCurrentSvg() {
  if (!currentDetail || !currentDetail.svg) {
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(currentDetail.svg);
    } else if (!copyTextFallback(currentDetail.svg)) {
      throw new Error("Copy failed in this browser.");
    }
    setDetailCopyFeedback("SVG markup copied.");
  } catch (error) {
    setDetailCopyFeedback(error.message || "Unable to copy SVG.", { isError: true });
  }
}

async function runDiscordExport({ svg, sourceName, setFeedback } = {}) {
  if (isExportingDiscord) {
    setStatus(`Export to Discord already in progress. ${DISCORD_EXPORT_TIME_HINT}`);
    return;
  }
  const svgMarkup = String(svg || "").trim();
  if (!svgMarkup) {
    setStatus("Missing SVG markup to export to Discord.", { isError: true });
    if (typeof setFeedback === "function") {
      setFeedback(`export to Discord failed. ${DISCORD_EXPORT_TIME_HINT}`, { isError: true });
    }
    return;
  }

  try {
    setDiscordExportLoading(true);
    if (typeof setFeedback === "function") {
      setFeedback(`exporting to Discord... ${DISCORD_EXPORT_TIME_HINT.toLowerCase()}`);
    }
    setStatus(`Exporting to Discord... ${DISCORD_EXPORT_TIME_HINT}`);

    const payload = await fetchJsonWithTimeout(
      "/api/discord-export",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetId: getSelectedDiscordExportPresetId(),
          sourceName: sourceName || "animated-svg.svg",
          svg: svgMarkup,
        }),
      },
      180000,
    );

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
      if (typeof setFeedback === "function") {
        setFeedback(`export to Discord downloaded (${summary}). ${DISCORD_EXPORT_TIME_HINT}`);
      }
      setStatus(`Export to Discord ready: ${fileName}. ${DISCORD_EXPORT_TIME_HINT}`);
    } else {
      if (typeof setFeedback === "function") {
        setFeedback(`export to Discord downloaded (over limit: ${summary}). ${DISCORD_EXPORT_TIME_HINT}`, {
          isError: true,
        });
      }
      const warning = payload?.output?.warning || "Export to Discord downloaded, but it exceeds Discord size limits.";
      setStatus(`${warning} ${DISCORD_EXPORT_TIME_HINT}`, {
        isError: true,
      });
    }
  } catch (error) {
    if (typeof setFeedback === "function") {
      const message = /timed out/i.test(String(error?.message || ""))
        ? `export to Discord timed out. ${DISCORD_EXPORT_TIME_HINT}`
        : `export to Discord failed. ${DISCORD_EXPORT_TIME_HINT}`;
      setFeedback(message, { isError: true });
    }
    const errorMessage = error?.message || "Export to Discord failed.";
    setStatus(`${errorMessage} ${DISCORD_EXPORT_TIME_HINT}`, { isError: true });
  } finally {
    setDiscordExportLoading(false);
  }
}

async function exportLibraryItemForDiscord({ scope, name } = {}) {
  const itemName = String(name || "").trim();
  if (!itemName) {
    return;
  }
  const activeScope = normalizeScope(scope);
  if (currentDetail && currentDetail.scope === activeScope && currentDetail.name === itemName && currentDetail.svg) {
    await runDiscordExport({
      svg: currentDetail.svg,
      sourceName: itemName,
      setFeedback: setDetailDiscordExportFeedback,
    });
    return;
  }

  try {
    setStatus(`Preparing ${itemName} to export to Discord... ${DISCORD_EXPORT_TIME_HINT}`);
    const payload = await fetchJsonWithTimeout(
      `/api/library/item?scope=${encodeURIComponent(activeScope)}&name=${encodeURIComponent(itemName)}`,
      {},
      45000,
    );
    await runDiscordExport({
      svg: typeof payload.svg === "string" ? payload.svg : "",
      sourceName: payload.name || itemName,
    });
  } catch (error) {
    const errorMessage = error?.message || "Unable to load SVG to export to Discord.";
    setStatus(`${errorMessage} ${DISCORD_EXPORT_TIME_HINT}`, { isError: true });
  }
}

async function exportCurrentDetailForDiscord() {
  if (!currentDetail?.svg) {
    setStatus(`Open an SVG first to export to Discord. ${DISCORD_EXPORT_TIME_HINT}`, { isError: true });
    return;
  }
  await runDiscordExport({
    svg: currentDetail.svg,
    sourceName: currentDetail.name || "animated-svg.svg",
    setFeedback: setDetailDiscordExportFeedback,
  });
}

async function applyDetailStateFromUrl() {
  const detailState = getDetailFromUrl();
  if (!detailState) {
    closeDetail({ syncUrl: false });
    return;
  }
  await openDetail({
    scope: detailState.scope,
    name: detailState.name,
    syncUrl: false,
    pushUrl: false,
  });
}

refreshButton.addEventListener("click", loadGrid);
includeHiddenToggle.addEventListener("change", loadGrid);

if (cutModeSelect) {
  cutModeSelect.addEventListener("change", () => {
    applyGridCutMode();
    syncUrlState();
  });
}

if (cutRatioInput) {
  cutRatioInput.addEventListener("input", () => {
    applyGridCutMode();
    syncUrlState();
  });
  cutRatioInput.addEventListener("change", () => {
    applyGridCutMode();
    syncUrlState();
  });
  cutRatioInput.addEventListener("blur", () => {
    applyGridCutMode();
    syncUrlState();
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

if (detailBackButton) {
  detailBackButton.addEventListener("click", () => {
    closeDetail({ syncUrl: true, pushUrl: true });
  });
}

if (detailCopyButton) {
  detailCopyButton.addEventListener("click", copyCurrentSvg);
}
if (detailDiscordExportButton) {
  detailDiscordExportButton.addEventListener("click", exportCurrentDetailForDiscord);
}
if (discordExportPresetSelect) {
  discordExportPresetSelect.addEventListener("change", () => {
    setDetailDiscordExportFeedback("");
  });
}

window.addEventListener("popstate", () => {
  applyCutSettingsFromUrl();
  applyGridCutMode();
  applyDetailStateFromUrl();
});

loadThemePreference();
applyCutSettingsFromUrl();
applyGridCutMode();
loadDiscordExportPresets().catch(() => {
  refreshDiscordExportControlStates();
});

loadGrid().then(() => {
  applyDetailStateFromUrl();
});
