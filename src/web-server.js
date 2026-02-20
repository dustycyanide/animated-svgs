const path = require("path");
const { spawn } = require("child_process");

const HOST = "127.0.0.1";
const PORT = Number.parseInt(String(process.env.WEB_PORT || "3000"), 10) || 3000;
const PROJECT_ROOT = path.resolve(__dirname, "..");
const VITE_BIN = path.resolve(PROJECT_ROOT, "node_modules", "vite", "bin", "vite.js");

function start() {
  const runtimeCwd = process.cwd();
  let shutdownTimer = null;
  const child = spawn(
    process.execPath,
    [
      VITE_BIN,
      "dev",
      "--host",
      HOST,
      "--port",
      String(PORT),
      "--config",
      path.resolve(PROJECT_ROOT, "vite.config.mts"),
      "--strictPort",
    ],
    {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        ANIMATED_SVGS_WORKDIR: process.env.ANIMATED_SVGS_WORKDIR || runtimeCwd,
      },
      stdio: ["inherit", "inherit", "inherit"],
    },
  );

  const stop = (signal) => {
    if (child.exitCode === null) {
      child.kill(signal);
    }
    if (!shutdownTimer) {
      shutdownTimer = setTimeout(() => {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
      }, 5000);
    }
  };

  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  child.on("exit", (code, signal) => {
    if (shutdownTimer) {
      clearTimeout(shutdownTimer);
      shutdownTimer = null;
    }

    if (typeof code === "number") {
      process.exit(code);
      return;
    }

    if (signal) {
      process.exit(0);
      return;
    }

    process.exit(1);
  });
}

start();
