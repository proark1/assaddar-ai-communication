import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT ?? 5174);
const widgetPath = fileURLToPath(new URL("./dist/widget.js", import.meta.url));

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === "/health") {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("ok");
    return;
  }

  if (url.pathname !== "/" && url.pathname !== "/widget.js") {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  try {
    const file = await stat(widgetPath);
    response.writeHead(200, {
      "Cache-Control": "public, max-age=300",
      "Content-Length": file.size,
      "Content-Type": "application/javascript; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    });

    if (method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(widgetPath).pipe(response);
  } catch {
    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Widget bundle not built");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Assaddar widget server listening on ${port}`);
});
