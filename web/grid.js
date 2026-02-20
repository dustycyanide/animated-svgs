const gridEl = document.getElementById("svg-grid");
const statusEl = document.getElementById("grid-status");
const metaEl = document.getElementById("grid-meta");
const refreshButton = document.getElementById("refresh-grid-btn");
const includeHiddenToggle = document.getElementById("include-hidden-toggle");
const cutModeSelect = document.getElementById("grid-cut-mode-select");
const cutRatioInput = document.getElementById("grid-cut-ratio-input");
const themeSelect = document.getElementById("grid-theme-select");
const ALLOWED_CUT_MODES = new Set(["original", "square", "circle", "ratio"]);
const THEME_STORAGE_KEY = "animated-svgs-theme";

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

function applyGridCutMode() {
  if (!gridEl) {
    return;
  }
  const mode = normalizeCutMode(cutModeSelect?.value);
  gridEl.classList.remove("cut-mode-square", "cut-mode-circle", "cut-mode-ratio");
  if (mode === "square") {
    gridEl.classList.add("cut-mode-square");
  } else if (mode === "circle") {
    gridEl.classList.add("cut-mode-circle");
  } else if (mode === "ratio") {
    const parsed = parseRatioValue(cutRatioInput?.value || "");
    gridEl.classList.add("cut-mode-ratio");
    gridEl.style.setProperty("--grid-cut-ratio", String(parsed || 16 / 9));
  }

  if (cutRatioInput) {
    cutRatioInput.disabled = mode !== "ratio";
  }
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

function syncCutSettingsToUrl() {
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

  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
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

    const openButton = document.createElement("a");
    openButton.className = "btn btn-secondary";
    openButton.target = "_blank";
    openButton.rel = "noopener noreferrer";
    openButton.href = `/api/library/file?scope=${encodeURIComponent(item.scope)}&name=${encodeURIComponent(item.name)}`;
    openButton.textContent = "Open SVG";

    actions.appendChild(openButton);
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
    if (cutRatioInput) {
      cutRatioInput.disabled = true;
    }

    const [createdPayload, archivedPayload] = await Promise.all([
      fetchJson("/api/library?scope=created"),
      fetchJson("/api/library?scope=archived"),
    ]);

    const includeHidden = includeHiddenToggle.checked;
    const allItems = includeHidden
      ? [...createdPayload.items, ...archivedPayload.items]
      : [...createdPayload.items];

    allItems.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    renderGrid(allItems);
    applyGridCutMode();
    metaEl.textContent = includeHidden
      ? `${allItems.length} total (${createdPayload.items.length} created, ${archivedPayload.items.length} hidden)`
      : `${allItems.length} created (${archivedPayload.items.length} hidden not shown)`;
    if (allItems.length === 0) {
      setStatus("No SVGs yet. Use + Generate SVG to create your first one.");
    } else {
      setStatus(`Loaded ${allItems.length} SVG${allItems.length === 1 ? "" : "s"}.`);
    }
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

refreshButton.addEventListener("click", loadGrid);
includeHiddenToggle.addEventListener("change", loadGrid);
if (cutModeSelect) {
  cutModeSelect.addEventListener("change", () => {
    applyGridCutMode();
    syncCutSettingsToUrl();
  });
}
if (cutRatioInput) {
  cutRatioInput.addEventListener("blur", () => {
    applyGridCutMode();
    syncCutSettingsToUrl();
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

loadThemePreference();
applyCutSettingsFromUrl();
applyGridCutMode();
loadGrid();
