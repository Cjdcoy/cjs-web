import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const distDirectory = path.resolve("dist");
const requiredFiles = ["index.html", "_headers", ".assetsignore", ".vite/manifest.json"];
const releaseFiles = await listFiles(distDirectory);
const failures = [];

for (const requiredFile of requiredFiles) {
  if (!releaseFiles.includes(requiredFile)) failures.push(`Missing dist/${requiredFile}`);
}

for (const file of releaseFiles) {
  if (file.endsWith(".map")) failures.push(`Source map must not ship: dist/${file}`);
  if (/(^|\/)(?:\.env(?:\..*)?|\.dev\.vars|wrangler\.toml)$/i.test(file)) {
    failures.push(`Sensitive configuration must not ship: dist/${file}`);
  }
}

const headers = await readRequiredFile("_headers");
const assetsIgnore = await readRequiredFile(".assetsignore");

for (const expected of [
  "/assets/*",
  "Cache-Control: public, max-age=31536000, immutable",
  "Content-Security-Policy:",
  "Permissions-Policy:",
  "Referrer-Policy: strict-origin-when-cross-origin",
  "X-Content-Type-Options: nosniff",
  "X-Frame-Options: DENY",
]) {
  if (!headers.includes(expected)) failures.push(`dist/_headers is missing: ${expected}`);
}

for (const expected of [".vite/", "*.map"]) {
  if (!assetsIgnore.includes(expected)) {
    failures.push(`dist/.assetsignore is missing: ${expected}`);
  }
}

const generatedCode = releaseFiles.filter((file) => /\.(?:css|js)$/.test(file));
for (const file of generatedCode) {
  const contents = await readFile(path.join(distDirectory, file), "utf8");
  if (/sourceMappingURL\s*=/.test(contents)) {
    failures.push(`Generated asset references a source map: dist/${file}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `PASS release artifact policy: ${releaseFiles.length} files, no source maps or sensitive configuration`,
  );
}

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) {
        return listFiles(path.join(directory, entry.name), relativePath);
      }
      return [relativePath];
    }),
  );
  return files.flat().sort();
}

async function readRequiredFile(file) {
  try {
    return await readFile(path.join(distDirectory, file), "utf8");
  } catch {
    return "";
  }
}
