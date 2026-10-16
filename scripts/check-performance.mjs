import { readFile, readdir, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import process from "node:process";

const distDirectory = path.resolve("dist");
const manifestPath = path.join(distDirectory, ".vite", "manifest.json");
// The three.js map viewer (ADR 0004) is measured on its own: it must stay a lazily loaded chunk
// and is excluded from the route and total budgets that every page pays for.
const mapViewerEntryKey = "src/features/mapViewer/MapViewerCanvas.tsx";
const budgets = {
  initialJavaScriptGzip: 75 * 1024,
  initialCssGzip: 8 * 1024,
  routeIncrementGzip: 36 * 1024,
  // 155 KiB since ADR 0005 (web replay-view analytics); measured at 154.0 KiB.
  totalJavaScriptGzip: 155 * 1024,
  totalCssGzip: 22 * 1024,
  mapViewerGzip: 170 * 1024,
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
const mapViewerEntry = manifest[mapViewerEntryKey];
if (!mapViewerEntry?.isDynamicEntry) {
  throw new Error(
    `${mapViewerEntryKey} must stay a dynamic import so three.js never loads eagerly.`,
  );
}
if (entries.some((asset) => asset.imports?.includes(mapViewerEntryKey))) {
  throw new Error(`${mapViewerEntryKey} must not be imported statically.`);
}
const routeEntries = entries.filter((asset) => asset.isDynamicEntry && asset !== mapViewerEntry);
const routeAssetLists = routeEntries.map(incrementAssets);
const routeIncrements = await Promise.all(
  routeAssetLists.map((routeAssets) => gzipSize(routeAssets.map(fromDist))),
);
const routeAssets = new Set(routeAssetLists.flat());
const mapViewerAssets = incrementAssets(mapViewerEntry);
const mapViewerOnly = new Set(
  mapViewerAssets.filter((file) => !routeAssets.has(file)).map(fromDist),
);
const isShared = (file) => !mapViewerOnly.has(file);

const measurements = {
  initialJavaScriptGzip: await gzipSize(initialJavaScript.map(fromDist)),
  initialCssGzip: await gzipSize(initialCss.map(fromDist)),
  routeIncrementGzip: Math.max(0, ...routeIncrements),
  totalJavaScriptGzip: await gzipSize(javascriptFiles.filter(isShared)),
  totalCssGzip: await gzipSize(cssFiles.filter(isShared)),
  mapViewerGzip: await gzipSize(mapViewerAssets.map(fromDist)),
};

let failed = false;
for (const [name, budget] of Object.entries(budgets)) {
  const measured = measurements[name];
  const status = measured <= budget ? "PASS" : "FAIL";
  console.log(`${status} ${name}: ${formatBytes(measured)} / ${formatBytes(budget)}`);
  if (measured > budget) failed = true;
}

if (failed) process.exitCode = 1;

function incrementAssets(asset) {
  return [...collectInitialAssets(asset, manifest)].filter(
    (file) => !initialAssets.has(file) && /\.(css|js)$/.test(file),
  );
}

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
