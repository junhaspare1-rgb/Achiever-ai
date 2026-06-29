import { processGeminiRequest } from "../../api/gemini.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "허용되지 않는 요청입니다." }),
    };
  }

  try {
    let body = {};
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "요청 형식이 올바르지 않습니다." }),
      };
    }

    const payload = await processGeminiRequest(body);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    };
  } catch (error) {
    return {
      statusCode: error.statusCode || 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        error: error.publicMessage || "앗, 문제가 생겼어요. 다시 시도해주세요.",
      }),
    };
  }
}
