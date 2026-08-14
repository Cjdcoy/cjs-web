import { readFile, readdir, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import process from "node:process";

const distDirectory = path.resolve("dist");
const manifestPath = path.join(distDirectory, ".vite", "manifest.json");
const budgets = {
  initialJavaScriptGzip: 75 * 1024,
  initialCssGzip: 8 * 1024,
  routeIncrementGzip: 30 * 1024,
  totalJavaScriptGzip: 115 * 1024,
  totalCssGzip: 16 * 1024,
};

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const entries = Object.values(manifest);
const entry = entries.find((asset) => asset.isEntry);

if (!entry) {
  throw new Error("The Vite manifest does not contain an application entry.");
}

const initialAssets = collectInitialAssets(entry, manifest);
const assetFiles = await listFiles(path.join(distDirectory, "assets"));
const javascriptFiles = assetFiles.filter((file) => file.endsWith(".js"));
const cssFiles = assetFiles.filter((file) => file.endsWith(".css"));
const initialJavaScript = [...initialAssets].filter((file) => file.endsWith(".js"));
const initialCss = [...initialAssets].filter((file) => file.endsWith(".css"));
const dynamicEntries = entries.filter((asset) => asset.isDynamicEntry);
const routeIncrements = await Promise.all(
  dynamicEntries.map(async (asset) => {
    const routeAssets = [...collectInitialAssets(asset, manifest)].filter(
      (file) => !initialAssets.has(file) && /\.(css|js)$/.test(file),
    );
    return gzipSize(routeAssets.map(fromDist));
  }),
);

const measurements = {
  initialJavaScriptGzip: await gzipSize(initialJavaScript.map(fromDist)),
  initialCssGzip: await gzipSize(initialCss.map(fromDist)),
  routeIncrementGzip: Math.max(0, ...routeIncrements),
  totalJavaScriptGzip: await gzipSize(javascriptFiles),
  totalCssGzip: await gzipSize(cssFiles),
};

let failed = false;
for (const [name, budget] of Object.entries(budgets)) {
  const measured = measurements[name];
  const status = measured <= budget ? "PASS" : "FAIL";
  console.log(`${status} ${name}: ${formatBytes(measured)} / ${formatBytes(budget)}`);
  if (measured > budget) failed = true;
}

if (failed) process.exitCode = 1;

function collectInitialAssets(root, allAssets) {
  const files = new Set([root.file, ...(root.css ?? [])]);
  const pending = [...(root.imports ?? [])];
  const visited = new Set();

  while (pending.length > 0) {
    const key = pending.pop();
    if (!key || visited.has(key)) continue;
    visited.add(key);
    const asset = allAssets[key];
    if (!asset) throw new Error(`Missing Vite manifest asset: ${key}`);
    files.add(asset.file);
    for (const css of asset.css ?? []) files.add(css);
    pending.push(...(asset.imports ?? []));
  }

  return files;
}

async function listFiles(directory) {
  const entries = await readdir(directory);
  return Promise.all(
    entries.map(async (entryName) => {
      const file = path.join(directory, entryName);
      const metadata = await stat(file);
      if (!metadata.isFile()) throw new Error(`Unexpected directory in Vite assets: ${file}`);
      return file;
    }),
  );
}

async function gzipSize(files) {
  const sizes = await Promise.all(files.map(gzipFile));
  return sizes.reduce((total, size) => total + size, 0);
}

async function gzipFile(file) {
  return gzipSync(await readFile(file), { level: 9 }).byteLength;
}

function fromDist(file) {
  return path.join(distDirectory, file);
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB gzip`;
}
