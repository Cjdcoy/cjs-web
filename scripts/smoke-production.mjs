import process from "node:process";

const productionUrl = parseProductionUrl(process.env.CJS_PRODUCTION_URL);
const routes = [
  "/",
  "/leaderboards",
  "/maps/101?source=jh",
  "/players/501?source=jh",
  "/about",
  "/favorites",
];

let homeDocument = "";
let homeResponse;
for (const route of routes) {
  const url = new URL(route, productionUrl);
  const response = await fetchWithRetry(url);
  const document = await response.text();
  if (!response.ok) throw new Error(`${url.pathname} returned HTTP ${response.status}.`);
  if (!response.headers.get("content-type")?.includes("text/html")) {
    throw new Error(`${url.pathname} did not return HTML.`);
  }
  if (!document.includes('<div id="root"></div>')) {
    throw new Error(`${url.pathname} did not return the CJS application shell.`);
  }
  if (route === "/") {
    homeDocument = document;
    homeResponse = response;
  }
  console.log(`PASS ${url.pathname}${url.search} -> ${response.status}`);
}

for (const [name, expected] of [
  ["content-security-policy", "frame-ancestors 'none'"],
  ["permissions-policy", "camera=()"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"],
]) {
  const value = homeResponse.headers.get(name) ?? "";
  if (!value.includes(expected)) throw new Error(`Production response is missing ${name}.`);
}

const entryAsset = homeDocument.match(/(?:src|href)="(\/assets\/[^"]+\.(?:css|js))"/)?.[1];
if (!entryAsset) throw new Error("Production HTML does not reference a fingerprinted entry asset.");
const assetResponse = await fetchWithRetry(new URL(entryAsset, productionUrl));
const cacheControl = assetResponse.headers.get("cache-control") ?? "";
if (
  !assetResponse.ok ||
  !/max-age=31536000/.test(cacheControl) ||
  !/immutable/.test(cacheControl)
) {
  throw new Error("Fingerprinted assets do not have the immutable one-year cache policy.");
}
console.log(`PASS ${entryAsset} -> immutable cache policy and security headers`);

function parseProductionUrl(value) {
  const url = new URL(value ?? "");
  if (url.protocol !== "https:") throw new Error("CJS_PRODUCTION_URL must use HTTPS.");
  return url;
}

async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: { Accept: "text/html,application/xhtml+xml" },
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok || attempt === 5) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }
  throw new Error(`Production request failed for ${url.pathname}.`, { cause: lastError });
}
