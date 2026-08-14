import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("static document metadata", () => {
  it("publishes favicon, manifest, and social preview metadata", () => {
    const html = readFileSync(resolve("index.html"), "utf8");

    expect(html).toContain('<link rel="icon" href="/logo.svg" type="image/svg+xml" />');
    expect(html).toContain('<link rel="manifest" href="/site.webmanifest" />');
    expect(html).toContain('<meta property="og:image" content="/social-card.svg" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  it("uses committed project-owned metadata assets", () => {
    const manifest = readFileSync(resolve("public/site.webmanifest"), "utf8");
    const socialCard = readFileSync(resolve("public/social-card.svg"), "utf8");

    expect(manifest).toContain('"name": "CodJumper Stats"');
    expect(manifest).toContain('"src": "/logo.svg"');
    expect(socialCard).toContain('<svg width="1200" height="630"');
    expect(socialCard).toContain("CodJumper Stats wordmark");
  });
});
