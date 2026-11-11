import { spawnSync } from "node:child_process";

// Workers Builds injects these variables. Only migrate the production D1
// database on the configured production branch, before its deploy command.
// Pull-request previews and local installs must never touch production D1.
const isWorkersBuild = process.env.WORKERS_CI === "1";
const branch = process.env.WORKERS_CI_BRANCH || "";

if (!isWorkersBuild || branch !== "main") {
  console.log(
    "Skipping remote D1 migrations (this is not a Cloudflare production build of main)."
  );
  process.exit(0);
}

console.log("Applying pending D1 migrations to the production DB binding before deployment...");

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  command,
  ["--yes", "wrangler@4", "d1", "migrations", "apply", "DB", "--remote"],
  {
    stdio: "inherit",
    env: process.env
  }
);

if (result.error) {
  console.error("Could not start the Wrangler D1 migration command:", result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.error("Remote D1 migration failed. Cloudflare must not deploy this Worker version.");
  process.exit(result.status ?? 1);
}

console.log("Production D1 migrations completed successfully.");
