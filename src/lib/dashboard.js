const fs = require("fs/promises");
const path = require("path");

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text);
}

async function collectRuns(outDir) {
  const entries = await fs.readdir(outDir, { withFileTypes: true });
  const runDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  const runs = [];
  for (const dirName of runDirs) {
    const absoluteDir = path.join(outDir, dirName);
    const summaryFileName = (await fileExists(path.join(absoluteDir, "07-summary.json")))
      ? "07-summary.json"
      : (await fileExists(path.join(absoluteDir, "05-summary.json")))
        ? "05-summary.json"
        : null;
    if (!summaryFileName) {
      continue;
    }
    const summaryPath = path.join(absoluteDir, summaryFileName);

    let summary;
    try {
      summary = await readJson(summaryPath);
    } catch {
      continue;
    }

    const stat = await fs.stat(absoluteDir);
    const previewFileName = (await fileExists(path.join(absoluteDir, "05-optimized.svg")))
      ? "05-optimized.svg"
      : "03-preprocessed.svg";
    const qaFileName = (await fileExists(path.join(absoluteDir, "04-qa.json")))
      ? "04-qa.json"
      : (await fileExists(path.join(absoluteDir, "06-qa-optimized.json")))
        ? "06-qa-optimized.json"
        : (await fileExists(path.join(absoluteDir, "04-qa-preprocessed.json")))
          ? "04-qa-preprocessed.json"
          : null;

    runs.push({
      dirName,
      createdAt: stat.mtime.toISOString(),
      model: summary.modelUsed,
      promptLength: summary.promptLength,
      qaPassed: typeof summary.qa?.passed === "boolean" ? summary.qa.passed : null,
      qaIssueCount:
        typeof summary.qa?.issueCount === "number" ? summary.qa.issueCount : null,
      preScore: summary.qa?.preprocessed?.score ?? null,
      preGrade: summary.qa?.preprocessed?.grade ?? null,
      postScore: summary.qa?.optimized?.score ?? null,
      postGrade: summary.qa?.optimized?.grade ?? null,
      previewPath: `${dirName}/${previewFileName}`,
      summaryPath: `${dirName}/${summaryFileName}`,
      qaPath: qaFileName ? `${dirName}/${qaFileName}` : null,
    });
  }

  runs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return runs;
}

function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderRunCard(run) {
  const hasSimpleQa = typeof run.qaPassed === "boolean";
  const badge = hasSimpleQa
    ? run.qaPassed
      ? "QA PASS"
      : "QA FAIL"
    : `${run.postScore ?? "-"} (${run.postGrade ?? "-"})`;
  const qaLine = hasSimpleQa
    ? `QA issues: ${run.qaIssueCount ?? "-"}`
    : `QA pre/post: ${run.preScore ?? "-"} -> ${run.postScore ?? "-"}`;
  const qaLink = run.qaPath
    ? `<a href="./${escapeHtml(run.qaPath)}" target="_blank">QA</a>`
    : "";
  return `
    <article class="card">
      <header class="card-head">
        <h3 title="${escapeHtml(run.dirName)}">${escapeHtml(run.dirName)}</h3>
        <span class="badge">${escapeHtml(String(badge))}</span>
      </header>
      <div class="meta">Model: ${escapeHtml(run.model || "unknown")} | Updated: ${escapeHtml(run.createdAt)}</div>
      <div class="meta">${escapeHtml(String(qaLine))}</div>
      <object class="preview" data="./${escapeHtml(run.previewPath)}" type="image/svg+xml"></object>
      <div class="links">
        <a href="./${escapeHtml(run.previewPath)}" target="_blank">SVG</a>
        <a href="./${escapeHtml(run.summaryPath)}" target="_blank">Summary</a>
        ${qaLink}
      </div>
    </article>
  `;
}

function renderHtml({ title, runs, outDir }) {
  const cards = runs.map(renderRunCard).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #f7f9fc;
      --card: #ffffff;
      --ink: #10243f;
      --muted: #5f738d;
      --accent: #0d6efd;
      --border: #d8e0ea;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif;
      color: var(--ink);
      background: radial-gradient(circle at 20% 0%, #e9f1ff 0%, var(--bg) 38%);
    }
    .wrap {
      max-width: 1320px;
      margin: 0 auto;
      padding: 24px;
    }
    .top {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 16px;
      margin-bottom: 18px;
      flex-wrap: wrap;
    }
    h1 {
      margin: 0;
      font-size: 1.35rem;
    }
    .hint {
      color: var(--muted);
      font-size: 0.95rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
      gap: 14px;
    }
    .card {
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--card);
      overflow: hidden;
      box-shadow: 0 8px 20px rgba(16, 36, 63, 0.06);
      padding: 12px;
    }
    .card-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .card-head h3 {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 600;
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
    }
    .badge {
      background: #e6f0ff;
      color: #0c3d92;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 0.78rem;
      white-space: nowrap;
    }
    .meta {
      color: var(--muted);
      font-size: 0.82rem;
      margin-bottom: 4px;
    }
    .preview {
      width: 100%;
      aspect-ratio: 1 / 1;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 10px;
      margin-top: 8px;
    }
    .links {
      display: flex;
      gap: 10px;
      margin-top: 10px;
      font-size: 0.82rem;
    }
    .links a {
      color: var(--accent);
      text-decoration: none;
      font-weight: 600;
    }
    .empty {
      border: 1px dashed var(--border);
      border-radius: 12px;
      padding: 18px;
      color: var(--muted);
      background: #fff;
    }
  </style>
</head>
<body>
  <main class="wrap">
    <div class="top">
      <h1>${escapeHtml(title)}</h1>
      <div class="hint">Directory: ${escapeHtml(outDir)} | Runs: ${runs.length} | Reload page to refresh</div>
    </div>
    <section class="grid">
      ${cards || '<div class="empty">No runs found yet. Execute the pipeline or iterate command first.</div>'}
    </section>
  </main>
</body>
</html>`;
}

async function generateDashboard({ outDir, title }) {
  const absoluteOutDir = path.resolve(process.cwd(), outDir);
  await fs.mkdir(absoluteOutDir, { recursive: true });

  let resolvedTitle = title || "SVG Iteration Dashboard";
  if (!title) {
    const reportPath = path.join(absoluteOutDir, "iteration-report.json");
    if (await fileExists(reportPath)) {
      try {
        const report = await readJson(reportPath);
        if (typeof report.title === "string" && report.title.trim().length > 0) {
          resolvedTitle = report.title.trim();
        }
      } catch {
        // Keep fallback title.
      }
    }
  }

  const runs = await collectRuns(absoluteOutDir);
  const html = renderHtml({
    title: resolvedTitle,
    runs,
    outDir: absoluteOutDir,
  });

  const htmlPath = path.join(absoluteOutDir, "index.html");
  await fs.writeFile(htmlPath, html, "utf8");

  return {
    htmlPath,
    runCount: runs.length,
    outDir: absoluteOutDir,
  };
}

module.exports = {
  generateDashboard,
};
