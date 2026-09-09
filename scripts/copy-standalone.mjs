/**
 * Post-build copy for `output: "standalone"`.
 *
 * Next emits a standalone server that deliberately excludes static assets;
 * they have to be placed alongside it. This used to be two `cp -r` calls in
 * the npm script, which only work in a POSIX shell — the build failed in cmd
 * and PowerShell. `fs.cp` does the same job on every platform.
 */
import { cp, access } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(standalone))) {
  console.error(
    "[copy-standalone] .next/standalone is missing — run `next build` with output: \"standalone\" first."
  );
  process.exit(1);
}

const jobs = [
  { from: join(root, ".next", "static"), to: join(standalone, ".next", "static"), label: ".next/static" },
  { from: join(root, "public"), to: join(standalone, "public"), label: "public" },
];

for (const job of jobs) {
  if (!(await exists(job.from))) {
    console.log(`[copy-standalone] skipped ${job.label} (not present)`);
    continue;
  }
  await cp(job.from, job.to, { recursive: true });
  console.log(`[copy-standalone] copied ${job.label}`);
}
