const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function createPublicError(message, statusCode = 500) {
  const error = new Error(message);
  error.publicMessage = message;
  error.statusCode = statusCode;
  return error;
}

function getApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw createPublicError("서버에 Gemini API Key가 설정되어 있지 않습니다.", 500);
  }
  return apiKey;
}

function buildTreePrompt({ goal, deadline, obstacle }) {
  return `
당신은 Achiever AI입니다.
사용자의 목표를 3개 레이어의 계층형 목표 트리 구조로 분해하세요.

사용자 목표: ${goal}
목표 기한: ${deadline || "정해지지 않음"}
예상 어려움: ${obstacle || "정해지지 않음"}

[분해 규칙]
L2 (중간 목표): 3~4개. 목표 달성을 위한 핵심 전략 축
L3 (실행 Task): 전체 10~15개. 각 L2당 3~5개. 지금 당장 실행 가능한 구체적인 행동 목표
  - 반드시 동사형으로 끝나는 한 문장으로 작성하세요.
  - "작성하기: 하루 섭취 칼로리 목표"처럼 콜론(:)을 쓰지 말고, "하루 섭취 칼로리 목표 작성하기"처럼 한 문장으로 작성하세요.
  - 완료 여부를 명확히 판단할 수 있어야 합니다.
  - achieveTips에는 해당 Task가 필요한 이유 또는 구체적인 실행 방법을 한국어 1문장으로 2~4개 작성하세요.
  - L3 아래에 children을 만들지 마세요. L4는 생성하지 마세요.

Markdown, 설명 텍스트 없이 아래 JSON만 출력하세요:
{
  "id": "root",
  "layer": 1,
  "title": "${goal}",
  "status": "in_progress",
  "children": [
    {
      "id": "l2_1",
      "layer": 2,
      "title": "중간 목표명",
      "status": "in_progress",
      "children": [
        {
          "id": "l3_1_1",
          "layer": 3,
          "title": "실행 Task명",
          "estimatedMinutes": 30,
          "achieveTips": [
            "이 Task가 왜 필요한지 또는 어떻게 실행하면 좋은지 1문장으로 설명하세요."
          ],
          "status": "pending"
        }
      ]
    }
  ]
}
`.trim();
}

function buildSubdividePrompt({ currentTask }) {
  return `
사용자가 이 Task를 너무 어렵다고 했습니다: "${currentTask}"
이 Task를 지금 당장 실행 가능한 2~3개의 더 작은 Step으로 나눠주세요.
각 Step은 동사형으로 끝나는 한 문장이어야 합니다.
Step title에는 콜론(:)을 쓰지 말고, "하루 섭취 칼로리 목표 작성하기"처럼 한 문장으로 작성하세요.
각 Step에는 achieveTips 배열을 넣고, 구체적인 방법 또는 필요한 이유를 한국어 1문장으로 2~4개 작성하세요.

Markdown 없이 아래 JSON 배열만 출력하세요:
[
  { "id": "sub_1", "layer": 4, "title": "더 작은 Task명", "estimatedMinutes": 10, "achieveTips": ["실행 이유 또는 구체적인 방법을 1문장으로 작성하세요."], "status": "pending" },
  { "id": "sub_2", "layer": 4, "title": "더 작은 Task명", "estimatedMinutes": 15, "achieveTips": ["실행 이유 또는 구체적인 방법을 1문장으로 작성하세요."], "status": "pending" }
]
`.trim();
}

function buildAssistPrompt({ goal, currentTask, path, question, history }) {
  const safeHistory = Array.isArray(history)
    ? history
        .slice(-6)
        .map((message) => {
          const role = message?.role === "user" ? "사용자" : "Achiever AI";
          const content = String(message?.content || "").trim();
          return content ? `${role}: ${content}` : "";
        })
        .filter(Boolean)
        .join("\n")
    : "";

  return `
당신은 Achiever AI의 한국어 AI 코치입니다.
사용자가 현재 실행 Task를 바로 완료할 수 있도록 짧고 구체적으로 도와주세요.

궁극적 목표: ${goal || "정해지지 않음"}
현재 경로: ${path || "정해지지 않음"}
현재 Task: ${currentTask}
${safeHistory ? `이전 대화\n${safeHistory}` : ""}
${question ? `사용자 질문: ${question}` : "요청: 현재 Task를 완료하기 위한 실행 방법을 제안해주세요."}

[응답 규칙]
1. 반드시 한국어로만 답합니다.
2. 지금 바로 실행할 수 있는 행동만 제안합니다.
3. 3~5개의 짧은 제안 또는 예시를 포함합니다.
4. 마지막 문장은 "추천 실행안"으로 시작합니다.
5. 900자 이내로 답합니다.
6. Markdown 코드블록은 사용하지 않습니다.
7. 답변에 "**" 문자를 절대 포함하지 않습니다.
`.trim();
}

function stripJsonFence(text) {
  return String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

function extractJsonValue(text, expectedType) {
  const withoutFence = stripJsonFence(text);

  try {
    return JSON.parse(withoutFence);
  } catch {
    const startToken = expectedType === "array" ? "[" : "{";
    const endToken = expectedType === "array" ? "]" : "}";
    const start = withoutFence.indexOf(startToken);
    const end = withoutFence.lastIndexOf(endToken);

    if (start === -1 || end === -1 || end <= start) {
      throw createPublicError("AI 응답을 JSON으로 변환하지 못했어요. 다시 시도해주세요.", 502);
    }

    try {
      return JSON.parse(withoutFence.slice(start, end + 1));
    } catch {
      throw createPublicError("AI 응답을 JSON으로 변환하지 못했어요. 다시 시도해주세요.", 502);
    }
  }
}

function normalizeStatus(status, fallback = "pending") {
  return ["pending", "in_progress", "done"].includes(status) ? status : fallback;
}

function clampMinutes(value, min, max, fallback) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(minutes)));
}

function normalizeTaskTitle(title) {
  const text = String(title || "").replace(/\s+/g, " ").trim();
  const colonMatch = text.match(/^(.+?하기)\s*[:：]\s*(.+)$/);

  if (!colonMatch) {
    return text.replace(/[:：]\s*/g, " ");
  }

  const action = colonMatch[1].trim();
  const target = colonMatch[2].trim();

  if (!target) {
    return action;
  }

  return `${target} ${action}`.replace(/\s+/g, " ").trim();
}

function normalizeTipSentence(tip) {
  const text = String(tip || "")
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*\d.)]+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return "";
  }

  return /[.!?。？！]$/.test(text) ? text : `${text}.`;
}

function buildFallbackAchieveTips(taskTitle, parentGoal) {
  const title = String(taskTitle || "현재 Task").trim();
  const goal = String(parentGoal || "상위 목표").trim();

  return [
    `${title}는 '${goal}' 목표를 실제 행동으로 옮기기 위한 구체적인 시작점이에요.`,
    "완료 기준이 분명해서 지금 바로 실행하고 진행 상황을 확인하기 좋아요.",
  ];
}

function normalizeAchieveTips(tips, taskTitle, parentGoal) {
  const source = Array.isArray(tips) ? tips : [];
  const normalized = source.map(normalizeTipSentence).filter(Boolean).slice(0, 4);

  if (normalized.length >= 2) {
    return normalized;
  }

  const fallbackTips = buildFallbackAchieveTips(taskTitle, parentGoal).map(normalizeTipSentence);
  return [...normalized, ...fallbackTips.filter((tip) => !normalized.includes(tip))].slice(0, 4);
}

function normalizeTreeNode(node, layer, id, titleFallback, parentTitle = "") {
  const rawTitle = String(node?.title || titleFallback || "").trim();
  const title = layer >= 3 ? normalizeTaskTitle(rawTitle) : rawTitle;
  if (!title) {
    throw createPublicError("AI 응답이 비어 있거나 목표가 없어요. 다시 시도해주세요.", 502);
  }

  const normalized = {
    id,
    layer,
    title,
    status: normalizeStatus(node?.status, layer === 1 ? "in_progress" : "pending"),
  };

  if (layer === 3 || layer === 4) {
    normalized.estimatedMinutes = clampMinutes(node?.estimatedMinutes, 5, 120, 20);
    normalized.achieveTips = normalizeAchieveTips(node?.achieveTips, title, parentTitle);
    normalized.status = normalizeStatus(node?.status, "pending");
    return normalized;
  }

  const children = Array.isArray(node?.children) ? node.children : [];
  if (children.length === 0) {
    throw createPublicError("AI가 목표 트리를 완성하지 못했어요. 다시 시도해주세요.", 502);
  }

  normalized.children = children.map((child, index) => {
    const childLayer = layer + 1;
    const childId =
      childLayer === 2
        ? `l2_${index + 1}`
        : childLayer === 3
          ? `${id}_${index + 1}`.replace("l2", "l3")
          : `${id}_${index + 1}`.replace("l3", "l4");

    return normalizeTreeNode(child, childLayer, childId, `목표 ${index + 1}`, title);
  });

  return normalized;
}

function normalizeGoalTree(tree, goal) {
  const normalized = normalizeTreeNode(tree, 1, "root", goal);
  normalized.status = "in_progress";
  return normalized;
}

function normalizeSubTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw createPublicError("AI가 더 작은 Task를 만들지 못했어요. 다시 시도해주세요.", 502);
  }

  return tasks.slice(0, 3).map((item, index) => {
    const title = normalizeTaskTitle(item?.title || item?.task || "");

    if (!title) {
      throw createPublicError("AI 응답이 비어 있거나 Task가 없어요. 다시 시도해주세요.", 502);
    }

    return {
      id: `sub_${index + 1}`,
      layer: 4,
      title,
      estimatedMinutes: clampMinutes(item?.estimatedMinutes, 5, 30, 10),
      achieveTips: normalizeAchieveTips(item?.achieveTips, title, "현재 Task"),
      status: "pending",
    };
  });
}

async function callGeminiText(prompt, generationConfig = { temperature: 0.7 }) {
  const apiKey = getApiKey();
  let response;
  try {
    response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
      }),
    });
  } catch {
    throw createPublicError("Gemini API에 연결하지 못했어요. 잠시 후 다시 시도해주세요.", 502);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 400 || response.status === 403) {
      throw createPublicError("Gemini API Key가 올바르지 않거나 권한이 없습니다.", response.status);
    }
    if (response.status === 429) {
      throw createPublicError("Gemini 사용량 한도에 도달했어요. 잠시 후 다시 시도해주세요.", 429);
    }

    throw createPublicError(
      data?.error?.message || "Gemini 응답을 받아오지 못했어요. 잠시 후 다시 시도해주세요.",
      response.status,
    );
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw createPublicError("Gemini 응답이 비어 있어요. 다시 시도해주세요.", 502);
  }

  return text.trim();
}

async function callGeminiJson(prompt, expectedType) {
  const text = await callGeminiText(prompt, {
    temperature: 0.7,
    responseMimeType: "application/json",
  });

  return extractJsonValue(text, expectedType);
}

async function readRequestBody(req) {
  if (req.body) {
    return req.body;
  }

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
        reject(createPublicError("요청 형식이 올바르지 않습니다.", 400));
      }
    });
    req.on("error", reject);
  });
}

export async function processGeminiRequest(body) {
  const mode = body?.mode;

  if (mode === "tree") {
    const goal = String(body.goal || "").trim();
    if (!goal) {
      throw createPublicError("목표를 입력해주세요.", 400);
    }

    const rawTree = await callGeminiJson(
      buildTreePrompt({
        goal,
        deadline: String(body.deadline || "").trim(),
        obstacle: String(body.obstacle || "").trim(),
      }),
      "object",
    );

    return { tree: normalizeGoalTree(rawTree, goal) };
  }

  if (mode === "subdivide") {
    const currentTask = String(body.currentTask || "").trim();
    if (!currentTask) {
      throw createPublicError("나눌 Task가 없습니다.", 400);
    }

    const rawTasks = await callGeminiJson(buildSubdividePrompt({ currentTask }), "array");
    return { tasks: normalizeSubTasks(rawTasks) };
  }

  if (mode === "assist") {
    const currentTask = String(body.currentTask || "").trim();
    if (!currentTask) {
      throw createPublicError("도움을 받을 Task가 없습니다.", 400);
    }

    const answer = await callGeminiText(
      buildAssistPrompt({
        goal: String(body.goal || "").trim(),
        currentTask,
        path: String(body.path || "").trim(),
        question: String(body.question || "").trim(),
        history: body.history,
      }),
    );

    return { answer: answer.replace(/```/g, "").replace(/\*\*/g, "").trim() };
  }

  throw createPublicError("요청 모드가 올바르지 않습니다.", 400);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "허용되지 않는 요청입니다." });
    return;
  }

  try {
    const body = await readRequestBody(req);
    res.status(200).json(await processGeminiRequest(body));
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicMessage || "앗, 문제가 생겼어요. 다시 시도해주세요.",
    });
  }
}
