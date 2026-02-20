import type { ReactElement } from "react";

const GRID_BOOTSTRAP_SCRIPT = `
(() => {
  if (window.__animatedSvgsGridBootstrapped) {
    return;
  }
  window.__animatedSvgsGridBootstrapped = true;

  const boot = () => {
    import("/grid.js").catch((error) => {
      console.error("Failed to load grid runtime.", error);
    });
  };

  if (window.__animatedSvgsHydrated) {
    setTimeout(boot, 0);
    return;
  }

  window.addEventListener("animated-svgs:hydrated", () => {
    setTimeout(boot, 0);
  }, { once: true });
})();
`;

export function getGridPageHead() {
  return {
    meta: [{ title: "Animated SVG Library" }],
    links: [{ rel: "stylesheet", href: "/grid.css" }],
  };
}

export function GridPage(): ReactElement {
  return (
    <>
      <main className="grid-page">
        <header className="grid-hero">
          <div>
            <p className="eyebrow">Library Grid</p>
            <h1>All Saved SVGs</h1>
            <p className="sub">
              Your grid is now the main view. Generate from the + actions whenever you want a new
              SVG.
            </p>
          </div>
          <div className="head-actions">
            <a href="/generate" className="btn btn-primary btn-generate-link">
              <span className="btn-plus" aria-hidden="true">
                +
              </span>
              Generate SVG
            </a>
            <button id="refresh-grid-btn" className="btn btn-secondary" type="button">
              Refresh Grid
            </button>
            <label className="inline-control" htmlFor="grid-theme-select">
              <span>Theme</span>
              <select id="grid-theme-select" className="select-input">
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label className="toggle">
              <input id="include-hidden-toggle" type="checkbox" />
              Include hidden
            </label>
            <label className="inline-control" htmlFor="grid-cut-mode-select">
              <span>Cut</span>
              <select id="grid-cut-mode-select" className="select-input">
                <option value="original">Original</option>
                <option value="square">Square</option>
                <option value="circle">Circle</option>
                <option value="ratio">Ratio</option>
              </select>
            </label>
            <label className="inline-control inline-control-ratio" htmlFor="grid-cut-ratio-input">
              <span>Ratio Arg</span>
              <input
                id="grid-cut-ratio-input"
                className="text-input"
                type="text"
                defaultValue="16:9"
                placeholder="16:9 or 1.78"
              />
            </label>
            <label className="inline-control discord-export-control" htmlFor="grid-discord-export-preset">
              <span>Export to Discord</span>
              <select id="grid-discord-export-preset" className="select-input"></select>
            </label>
            <label
              className="inline-control discord-export-config-control"
              htmlFor="grid-discord-export-config-preset"
            >
              <span>Preset</span>
              <select id="grid-discord-export-config-preset" className="select-input"></select>
            </label>
          </div>
        </header>

        <div id="grid-status" className="status">
          Loading library grid...
        </div>
        <div id="grid-meta" className="meta"></div>
        <section
          id="svg-detail-panel"
          className="panel viewer-card"
          aria-label="Selected SVG preview"
          hidden
        >
          <div className="detail-head">
            <div className="panel-head panel-head-tight">
              <h2 id="detail-title">Selected SVG</h2>
              <p id="detail-sub">Open an item from the grid to inspect it here.</p>
            </div>
            <div className="detail-actions">
              <button id="detail-back-btn" className="btn btn-secondary" type="button">
                Back to Grid
              </button>
              <button id="detail-copy-btn" className="btn btn-ghost" type="button" disabled>
                Copy SVG
              </button>
              <button
                id="detail-discord-export-btn"
                className="btn btn-secondary"
                type="button"
                disabled
              >
                Export to Discord
              </button>
              <a id="detail-download-link" className="btn btn-primary" href="#" download>
                Download SVG
              </a>
              <a
                id="detail-raw-link"
                className="btn btn-ghost"
                href="#"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Raw
              </a>
            </div>
          </div>
          <div id="detail-copy-feedback" className="detail-copy-feedback" aria-live="polite"></div>
          <div
            id="detail-discord-export-feedback"
            className="detail-discord-export-feedback"
            aria-live="polite"
          ></div>
          <div id="detail-viewer-stage" className="viewer-stage">
            <object
              id="detail-viewer"
              className="viewer"
              type="image/svg+xml"
              aria-label="Animated SVG preview"
            ></object>
            <div id="detail-empty" className="viewer-empty">
              Loading SVG preview...
            </div>
          </div>
        </section>
        <section id="svg-grid" className="svg-grid" aria-label="Saved SVG grid"></section>

        <a href="/generate" className="fab-generate" aria-label="Generate a new SVG">
          <span className="fab-generate-plus" aria-hidden="true">
            +
          </span>
          <span className="fab-generate-text">Generate</span>
        </a>
      </main>
      <script dangerouslySetInnerHTML={{ __html: GRID_BOOTSTRAP_SCRIPT }} />
    </>
  );
}
