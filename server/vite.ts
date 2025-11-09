import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { type Server } from "http";
import { createLogger } from "../shared/logger";

export function log(message: string, source = "express") {
  // Use shared logger; environment-gated. Namespace by source.
  const logger = createLogger(source);
  logger.info(message);
}

export async function setupVite(app: Express, server: Server) {
  // Fail fast in production environment
  if (process.env.NODE_ENV === "production") {
    throw new Error("setupVite should not be called in production");
  }

  // Dynamically import Vite and the vite config so this module can be
  // required in production without the `vite` devDependency being present.
  const { createServer: createViteServer, createLogger } = await import("vite");
  const viteConfig = (await import("../vite.config")).default;

  const viteLogger = createLogger();

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    // Skip GraphQL and API routes
    if (url.startsWith("/api") || url.startsWith("/graphql")) {
      return next();
    }

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "..", "dist", "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  app.use("*", (req, res, next) => {
    // Skip GraphQL and API routes
    if (req.originalUrl.startsWith("/api") || req.originalUrl.startsWith("/graphql")) {
      return next();
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
