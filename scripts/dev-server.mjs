import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, relative, resolve, sep, isAbsolute } from "node:path";
import contact from "../netlify/functions/contact.mjs";

const publicRoot = resolve("public");
const port = Number(process.env.PORT || 8888);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8"
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, { "X-Content-Type-Options": "nosniff", ...headers });
  response.end(body);
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/.netlify/functions/contact") {
    if (request.method !== "GET" && request.method !== "POST") {
      send(response, 405, JSON.stringify({ error: "Méthode non autorisée." }), {
        "Content-Type": "application/json; charset=utf-8",
        Allow: "GET, POST"
      });
      return;
    }

    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 16_384) {
        send(response, 413, JSON.stringify({ error: "Le formulaire est trop volumineux." }), {
          "Content-Type": "application/json; charset=utf-8"
        });
        return;
      }
      chunks.push(chunk);
    }

    const headers = Object.fromEntries(
      Object.entries(request.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value || ""])
    );
    headers["x-forwarded-proto"] = "http";

    try {
      const result = await contact({
        httpMethod: request.method,
        headers,
        body: Buffer.concat(chunks).toString("utf8")
      });
      send(response, result.statusCode, result.body, result.headers);
    } catch (error) {
      console.error("Local contact function failed:", error);
      send(response, 500, JSON.stringify({ error: "Erreur interne du serveur local." }), {
        "Content-Type": "application/json; charset=utf-8"
      });
    }
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    send(response, 405, "Méthode non autorisée.", { Allow: "GET, HEAD" });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    send(response, 400, "Chemin invalide.");
    return;
  }
  if (pathname === "/") pathname = "/index.html";

  const filePath = resolve(publicRoot, `.${pathname}`);
  const fileRelativePath = relative(publicRoot, filePath);
  if (fileRelativePath.startsWith(`..${sep}`) || fileRelativePath === ".." || isAbsolute(fileRelativePath)) {
    send(response, 403, "Accès refusé.");
    return;
  }

  try {
    const content = await readFile(filePath);
    send(response, 200, request.method === "HEAD" ? "" : content, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
  } catch {
    send(response, 404, "Fichier introuvable.");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Portfolio local : http://127.0.0.1:${port}`);
  console.log("Le formulaire envoie les emails si RESEND_API_KEY, CONTACT_EMAIL et FROM_EMAIL sont configurés.");
});
