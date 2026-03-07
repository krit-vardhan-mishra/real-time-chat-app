import express, { type Request, Response, NextFunction } from "express";
import { installConsoleInterceptor } from "../shared/setup-logging";
import { ApolloServer } from "apollo-server-express";
import { typeDefs } from "./graphql/schema";
import { resolvers } from "./graphql/resolvers";
import { registerRoutes } from "./routes";
import { ensureSchema } from "./db";
import { setupVite, serveStatic, log } from "./vite";
import dotenv from "dotenv";

// Load environment variables first
dotenv.config();

// Install logging override as early as possible
installConsoleInterceptor();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    const server = await registerRoutes(app);

    // Bind to port FIRST so the process is reachable (required by PaaS like Render)
    // before any async initialization that might fail.
    const port = parseInt(process.env.PORT || "5000", 10);
    await new Promise<void>((resolve) => {
      server.listen(port, "0.0.0.0", () => {
        process.stdout.write(`\n🚀 Server running on http://localhost:${port}\n`);
        process.stdout.write(`Press Ctrl+C to exit.\n\n`);
        log(`🚀 Server running on http://localhost:${port}`);
        resolve();
      });
    });

    // Surface a helpful warning if DB schema is out-of-date (non-fatal)
    await ensureSchema();

    // Setup Apollo GraphQL Server
    const apolloServer = new ApolloServer({
      typeDefs,
      resolvers,
      context: ({ req }: { req: Request }) => ({
        userId: req.isAuthenticated() ? req.user?.id : undefined,
        user: req.user,
      }),
      formatError: (err) => {
        log(`GraphQL Error: ${err.message}`);
        return err;
      },
    });

    await apolloServer.start();
    apolloServer.applyMiddleware({ 
      app: app as any, 
      path: "/graphql",
      cors: false, // Use express cors settings
    });

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
      throw err;
    });

    // Setup Vite or serve static assets based on environment.
    // In production, we skip Vite entirely to avoid importing the dependency.
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      try {
        await setupVite(app, server);
      } catch (err) {
        // Log and fallback to static serving. This prevents deployment crashes
        // when NODE_ENV isn't correctly set or devDependencies are missing.
        log(`Vite setup failed, falling back to static serve: ${(err as Error).message}`);
        serveStatic(app);
      }
    }

    log(`Server fully initialized.`);
  } catch (err) {
    process.stderr.write(`Fatal server error: ${(err as Error).message}\n${(err as Error).stack}\n`);
    process.exit(1);
  }
})();
