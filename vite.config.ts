import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const require = createRequire(import.meta.url);
const countryFlagsDirectory = join(dirname(require.resolve("circle-flags/package.json")), "flags");
const countryFlagFilePattern = /^[a-z]{2}\.svg$/;

function countryFlagAssets(): Plugin {
  let isProductionBuild = false;

  return {
    name: "cjs-country-flag-assets",
    configResolved(config) {
      isProductionBuild = config.command === "build";
    },
    async buildStart() {
      if (!isProductionBuild) return;

      const flagFiles = (await readdir(countryFlagsDirectory)).filter((fileName) =>
        countryFlagFilePattern.test(fileName),
      );
      await Promise.all(
        flagFiles.map(async (fileName) => {
          this.emitFile({
            type: "asset",
            fileName: `country-flags/${fileName}`,
            source: await readFile(join(countryFlagsDirectory, fileName)),
          });
        }),
      );
    },
    configureServer(server) {
      server.middlewares.use("/country-flags/", (request, response, next) => {
        const fileName = basename(request.url?.split("?", 1)[0] ?? "");
        if (!countryFlagFilePattern.test(fileName)) {
          next();
          return;
        }

        readFile(join(countryFlagsDirectory, fileName))
          .then((source) => {
            response.statusCode = 200;
            response.setHeader("Content-Type", "image/svg+xml");
            response.setHeader("Cache-Control", "public, max-age=3600");
            response.end(source);
          })
          .catch(() => next());
      });
    },
  };
}

export default defineConfig({
  build: {
    manifest: true,
    sourcemap: false,
  },
  plugins: [react(), countryFlagAssets()],
  server: { port: 5173 },
});
