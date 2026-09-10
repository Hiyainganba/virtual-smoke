import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let workerModule;

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    // Check if file exists in dist/client or public
    const publicPath = path.resolve(__dirname, "../public", "." + pathname);
    const clientPath = path.resolve(__dirname, "../dist/client", "." + pathname);

    let filePathToServe = null;
    if (pathname !== "/" && fs.existsSync(clientPath) && fs.statSync(clientPath).isFile()) {
      filePathToServe = clientPath;
    } else if (pathname !== "/" && fs.existsSync(publicPath) && fs.statSync(publicPath).isFile()) {
      filePathToServe = publicPath;
    }

    if (filePathToServe) {
      const ext = path.extname(filePathToServe).toLowerCase();
      const mimeTypes = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".wasm": "application/wasm",
        ".task": "application/octet-stream",
      };
      res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
      if (ext === ".wasm" || ext === ".task" || pathname.startsWith("/_next/static/")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
      return fs.createReadStream(filePathToServe).pipe(res);
    }

    if (!workerModule) {
      workerModule = await import("../dist/server/index.js");
    }
    const worker = workerModule.default || workerModule;

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    }

    const webReq = new Request(url.href, {
      method: req.method,
      headers,
    });

    const response = await worker.fetch(webReq, process.env, {
      waitUntil() {},
      passThroughOnException() {},
    });

    res.statusCode = response.status;
    for (const [k, v] of response.headers.entries()) {
      res.setHeader(k, v);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.end(buffer);
  } catch (err) {
    console.error("Vercel handler error:", err);
    res.statusCode = 500;
    res.end("Internal Server Error: " + (err instanceof Error ? err.message : String(err)));
  }
}
