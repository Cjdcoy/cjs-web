import process from "node:process";

const failures = [];
const productionUrl = process.env.CJS_PRODUCTION_URL?.trim() ?? "";
const releaseSha = process.env.RELEASE_SHA?.trim() ?? "";

if (process.env.CLOUDFLARE_ACCOUNT_ID_PRESENT !== "true") {
  failures.push("The production environment is missing CLOUDFLARE_ACCOUNT_ID.");
}
if (process.env.CLOUDFLARE_API_TOKEN_PRESENT !== "true") {
  failures.push("The production environment is missing CLOUDFLARE_API_TOKEN.");
}

let parsedProductionUrl;
try {
  parsedProductionUrl = new URL(productionUrl);
  if (parsedProductionUrl.protocol !== "https:") {
    failures.push("CJS_PRODUCTION_URL must use HTTPS.");
  }
  if (
    parsedProductionUrl.pathname !== "/" ||
    parsedProductionUrl.search ||
    parsedProductionUrl.hash
  ) {
    failures.push("CJS_PRODUCTION_URL must be an origin without a path, query, or fragment.");
  }
  if (parsedProductionUrl.hostname.endsWith(".workers.dev")) {
    failures.push("CJS_PRODUCTION_URL must be the dashboard-managed custom domain.");
  }
} catch {
  failures.push("CJS_PRODUCTION_URL must be a valid absolute URL.");
}

if (!/^[0-9a-f]{40}$/i.test(releaseSha)) {
  failures.push("RELEASE_SHA must identify the exact 40-character commit being deployed.");
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `PASS release configuration for ${parsedProductionUrl.hostname} at ${releaseSha.slice(0, 12)}`,
  );
}
