const gridPageEl = document.querySelector(".grid-page");
const gridEl = document.getElementById("svg-grid");
const statusEl = document.getElementById("grid-status");
const metaEl = document.getElementById("grid-meta");
const refreshButton = document.getElementById("refresh-grid-btn");
const includeHiddenToggle = document.getElementById("include-hidden-toggle");
const cutModeSelect = document.getElementById("grid-cut-mode-select");
const cutRatioInput = document.getElementById("grid-cut-ratio-input");
const themeSelect = document.getElementById("grid-theme-select");

const detailPanelEl = document.getElementById("svg-detail-panel");
const detailTitleEl = document.getElementById("detail-title");
const detailSubEl = document.getElementById("detail-sub");
const detailBackButton = document.getElementById("detail-back-btn");
const detailCopyButton = document.getElementById("detail-copy-btn");
const detailDownloadLink = document.getElementById("detail-download-link");
const detailRawLink = document.getElementById("detail-raw-link");
const detailCopyFeedbackEl = document.getElementById("detail-copy-feedback");
const detailViewerStageEl = document.getElementById("detail-viewer-stage");
const detailViewerEl = document.getElementById("detail-viewer");
const detailEmptyEl = document.getElementById("detail-empty");

const ALLOWED_CUT_MODES = new Set(["original", "square", "circle", "ratio"]);
const ALLOWED_SCOPES = new Set(["created", "archived"]);
const THEME_STORAGE_KEY = "animated-svgs-theme";

let allLibraryItems = [];
let gridSummary = {
  visibleCount: 0,
  createdCount: 0,
  archivedCount: 0,
  includeHidden: false,
};
let currentDetail = null;
let detailRequestToken = 0;

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
  if (detailDownloadLink) {
    detailDownloadLink.href = "#";
    detailDownloadLink.removeAttribute("download");
  }
  if (detailRawLink) {
    detailRawLink.href = "#";
  }
  setDetailCopyFeedback("");
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

    actions.appendChild(openButton);
    actions.appendChild(rawLink);
    body.appendChild(title);
    body.appendChild(sub);
    body.appendChild(actions);
    card.appendChild(preview);
    card.appendChild(body);
    gridEl.appendChild(card);
  }

  gridEl.appendChild(createGenerateCard());
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
  if (detailDownloadLink) {
    detailDownloadLink.href = "#";
    detailDownloadLink.removeAttribute("download");
  }
  if (detailRawLink) {
    detailRawLink.href = "#";
  }

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

window.addEventListener("popstate", () => {
  applyCutSettingsFromUrl();
  applyGridCutMode();
  applyDetailStateFromUrl();
});

loadThemePreference();
applyCutSettingsFromUrl();
applyGridCutMode();

loadGrid().then(() => {
  applyDetailStateFromUrl();
});
