import { createReadStream, promises as fs } from "node:fs";
import { createServer } from "node:http";
import { extname, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.EXP_BROWSER_PORT ?? 4173);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const server = createServer(async (request, response) => {
  const requested = decodeURIComponent((request.url ?? "/").split("?")[0]);
  const candidate = resolve(root, `.${requested === "/" ? "/platforms/browser/smoke.html" : requested}`);
  const relativePath = relative(root, candidate);
  if (relativePath.startsWith("..") || relativePath.includes("..\\") || relativePath.includes("../")) {
    response.writeHead(400);
    response.end("invalid path");
    return;
  }
  try {
    const stat = await fs.stat(candidate);
    if (!stat.isFile()) throw new Error("not a file");
    response.writeHead(200, { "content-type": contentTypes[extname(candidate)] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(normalize(candidate)).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`EXP browser smoke server listening at http://127.0.0.1:${port}/\n`);
});
