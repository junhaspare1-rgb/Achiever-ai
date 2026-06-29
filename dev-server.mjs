import http from "node:http";
import { createServer as createViteServer, loadEnv } from "vite";
import { processGeminiRequest } from "./api/gemini.js";

const env = loadEnv("development", process.cwd(), "");
Object.assign(process.env, env);

const port = Number(process.env.PORT || 5173);
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "spa",
});

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let rawBody = "";
    req.on("data", (chunk) => {
      rawBody += chunk;
    });
    req.on("end", () => {
      if (!rawBody) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(rawBody));
      } catch {
        reject(new Error("요청 형식이 올바르지 않습니다."));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.url?.startsWith("/api/gemini")) {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "허용되지 않는 요청입니다." }));
      return;
    }

    try {
      const body = await readJsonBody(req);
      const payload = await processGeminiRequest(body);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(payload));
    } catch (error) {
      const status = error.statusCode || 500;
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          error: error.publicMessage || "앗, 문제가 생겼어요. 다시 시도해주세요.",
        }),
      );
    }
    return;
  }

  vite.middlewares(req, res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Achiever dev server: http://localhost:${port}`);
});
