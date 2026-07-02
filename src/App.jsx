import { useEffect, useMemo, useState } from "react";
import * as d3 from "d3";
import {
  AlertCircle,
  ArrowRight,
  Check,
  FolderOpen,
  Frown,
  ListTodo,
  Loader2,
  Map as MapIcon,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Target,
  Trash2,
  Zap,
} from "lucide-react";

const STORAGE_KEYS = {
  goalTree: "achiever_goal_tree",
  activeTask: "achiever_active_task",
  startTime: "achiever_start_time",
  mapPhase: "achiever_map_phase",
  projects: "achiever_projects",
  activeProject: "achiever_active_project",
};

const LEGACY_STORAGE_KEYS = [
  "achiever_api_key",
  "achiever_goal",
  "achiever_deadline",
  "achiever_obstacle",
  "achiever_tasks",
  "achiever_current_index",
];

const EXAMPLE_GOALS = [
  "5kg 감량하기",
  "Python 기초부터 포트폴리오까지",
  "매일 아침 6시 기상 습관 만들기",
];

const EXAMPLE_DEADLINES = ["3주 안에", "이번 달 말까지", "100일 안에"];
const EXAMPLE_OBSTACLES = ["시간이 부족해요", "어디서 시작할지 모르겠어요", "꾸준히 지속하기 어려워요"];

const NODE_COLORS = {
  1: "#EA002C",
  2: "#F47725",
  3: "#D4D4D8",
  4: "#B91C1C",
  done: "#22C55E",
};

const QUESTION_COPY = {
  0: {
    label: "목표",
    title: "무엇을 이루고 싶으신가요?",
    placeholder: "무엇을 이루고 싶으신가요?",
    button: "분석 시작",
  },
  1: {
    label: "목표 기한",
    title: "언제까지 달성하고 싶으신가요?",
    placeholder: "예: 3주 안에, 이번 달 말까지",
    button: "다음 질문",
  },
  2: {
    label: "예상 어려움",
    title: "예상되는 가장 큰 어려움은 무엇인가요?",
    placeholder: "예: 시간이 부족해요, 어디서 시작할지 모르겠어요",
    button: "분석 시작",
  },
};

function safeParseJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function createProjectId() {
  return `project_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeStoredProjects(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((project) => project?.goalTree)
    .map((project, index) => {
      const activeTaskId = project.activeTaskId || findFirstPendingTaskId(project.goalTree);
      const now = Date.now();

      return {
        id: String(project.id || `project_${index + 1}`),
        title: String(project.title || project.goalTree?.title || "제목 없음"),
        goalTree: applyActiveStatus(project.goalTree, activeTaskId),
        activeTaskId,
        startTime: Number(project.startTime || now),
        mapPhase: Math.min(3, Math.max(1, Number(project.mapPhase || 1))),
        createdAt: Number(project.createdAt || project.startTime || now),
        updatedAt: Number(project.updatedAt || project.startTime || now),
      };
    });
}

function createProjectSnapshot({ id = createProjectId(), goalTree, activeTaskId, startTime, mapPhase, createdAt, updatedAt }) {
  const now = Date.now();
  const taskId = activeTaskId || findFirstPendingTaskId(goalTree);

  return {
    id,
    title: goalTree?.title || "제목 없음",
    goalTree: applyActiveStatus(goalTree, taskId),
    activeTaskId: taskId,
    startTime: startTime || now,
    mapPhase: Math.min(3, Math.max(1, Number(mapPhase || 1))),
    createdAt: createdAt || now,
    updatedAt: updatedAt || now,
  };
}

function readStoredState() {
  const storedTree = safeParseJson(localStorage.getItem(STORAGE_KEYS.goalTree));
  const storedActiveTask = localStorage.getItem(STORAGE_KEYS.activeTask) || "";
  const storedStartTime = Number(localStorage.getItem(STORAGE_KEYS.startTime) || "0");
  const storedMapPhase = Number(localStorage.getItem(STORAGE_KEYS.mapPhase) || "1");
  const storedProjects = normalizeStoredProjects(safeParseJson(localStorage.getItem(STORAGE_KEYS.projects)));
  const storedActiveProjectId = localStorage.getItem(STORAGE_KEYS.activeProject) || "";
  const legacyActiveTaskId = storedActiveTask || findFirstPendingTaskId(storedTree);
  const legacyProject =
    storedProjects.length === 0 && storedTree
      ? createProjectSnapshot({
          id: "project_legacy",
          goalTree: storedTree,
          activeTaskId: legacyActiveTaskId,
          startTime: Number.isFinite(storedStartTime) ? storedStartTime : Date.now(),
          mapPhase: Number.isFinite(storedMapPhase) ? storedMapPhase : 1,
        })
      : null;
  const projects = legacyProject ? [legacyProject] : storedProjects;
  const activeProject =
    projects.find((project) => project.id === storedActiveProjectId) || projects[0] || null;

  return {
    projects,
    activeProjectId: activeProject?.id || "",
    goalTree: activeProject?.goalTree || storedTree,
    activeTaskId: activeProject?.activeTaskId || storedActiveTask,
    startTime: activeProject?.startTime || (Number.isFinite(storedStartTime) ? storedStartTime : 0),
    mapPhase: activeProject?.mapPhase || (Number.isFinite(storedMapPhase) && storedMapPhase >= 1 ? Math.min(3, storedMapPhase) : 1),
  };
}

function formatDuration(startTime, endTime = Date.now()) {
  if (!startTime) {
    return "0분";
  }

  const minutes = Math.max(1, Math.round((endTime - startTime) / 60000));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${minutes}분`;
  }

  if (remainingMinutes === 0) {
    return `${hours}시간`;
  }

  return `${hours}시간 ${remainingMinutes}분`;
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return "기록 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatRelativeTime(timestamp) {
  if (!timestamp) {
    return "기록 없음";
  }

  const diffMinutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (diffMinutes < 60) {
    return `${diffMinutes}분 전 수정`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}시간 전 수정`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}일 전 수정`;
}

function wrapTitleLines(title, maxChars = 22) {
  const text = String(title || "").trim();
  if (!text) return [""];

  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = "";

  words.forEach((word) => {
    const chunks = [];
    for (let index = 0; index < word.length; index += maxChars) {
      chunks.push(word.slice(index, index + maxChars));
    }

    chunks.forEach((chunk) => {
      const candidate = currentLine ? `${currentLine} ${chunk}` : chunk;
      if (candidate.length <= maxChars) {
        currentLine = candidate;
        return;
      }

      if (currentLine) lines.push(currentLine);
      currentLine = chunk;
    });
  });

  if (currentLine) lines.push(currentLine);
  return lines.length ? lines : [text];
}

function isExecutableTask(node) {
  return Boolean(node) && (node.layer === 4 || (node.layer === 3 && (!node.children || node.children.length === 0)));
}

function collectExecutableTasks(node, ancestors = []) {
  if (!node) {
    return [];
  }

  if (isExecutableTask(node)) {
    return [
      {
        task: node,
        path: ancestors.filter((ancestor) => ancestor.layer > 1).map((ancestor) => ancestor.title),
      },
    ];
  }

  const nextAncestors = node.layer === 1 ? ancestors : [...ancestors, node];
  return (node.children || []).flatMap((child) => collectExecutableTasks(child, nextAncestors));
}

function getProgress(tree) {
  const tasks = collectExecutableTasks(tree);
  const done = tasks.filter(({ task }) => task.status === "done").length;
  const total = tasks.length;

  return {
    done,
    total,
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
  };
}

function findTaskEntry(tree, taskId) {
  return collectExecutableTasks(tree).find(({ task }) => task.id === taskId) || null;
}

function findFirstPendingTaskId(tree) {
  return collectExecutableTasks(tree).find(({ task }) => task.status !== "done")?.task.id || "";
}

function applyActiveStatus(node, activeTaskId) {
  if (!node) {
    return node;
  }

  if (isExecutableTask(node)) {
    return {
      ...node,
      status: node.status === "done" ? "done" : node.id === activeTaskId ? "in_progress" : "pending",
    };
  }

  const children = (node.children || []).map((child) => applyActiveStatus(child, activeTaskId));
  const allDone = children.length > 0 && children.every((child) => child.status === "done");
  const hasProgress = children.some((child) => child.status === "done" || child.status === "in_progress");

  return {
    ...node,
    children,
    status: allDone ? "done" : hasProgress || node.layer === 1 ? "in_progress" : "pending",
  };
}

function markTaskDone(node, taskId) {
  if (isExecutableTask(node)) {
    return node.id === taskId ? { ...node, status: "done" } : node;
  }

  return {
    ...node,
    children: (node.children || []).map((child) => markTaskDone(child, taskId)),
  };
}

function replaceTaskWithSubTasks(node, taskId, subTasks) {
  if (!node.children) {
    return node;
  }

  const children = node.children.flatMap((child) => {
    if (child.id === taskId && isExecutableTask(child)) {
      return subTasks.map((task, index) => ({
        id: `${taskId}_sub_${index + 1}`,
        layer: child.layer || 3,
        title: task.title,
        estimatedMinutes: Number(task.estimatedMinutes) || 10,
        achieveTips: normalizeAchieveTips(task.achieveTips, task.title, child.title),
        status: "pending",
      }));
    }

    return replaceTaskWithSubTasks(child, taskId, subTasks);
  });

  return {
    ...node,
    children,
  };
}

function visibleTreeByPhase(node, phase) {
  if (!node) {
    return null;
  }

  if (node.layer >= phase || !node.children) {
    return { ...node, children: undefined };
  }

  return {
    ...node,
    children: node.children.map((child) => visibleTreeByPhase(child, phase)).filter(Boolean),
  };
}

function sanitizeAssistText(text) {
  return String(text || "").replace(/\*\*/g, "").trim();
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

function normalizeTreeNode(node, layer, id, titleFallback, parentTitle = "") {
  const rawTitle = String(node?.title || titleFallback || "").trim();
  const title = layer >= 3 ? normalizeTaskTitle(rawTitle) : rawTitle;
  if (!title) {
    throw new Error("AI 응답이 비어 있거나 목표가 없어요. 다시 시도해주세요.");
  }

  const normalized = {
    id,
    layer,
    title,
    status: normalizeStatus(node?.status, layer === 1 ? "in_progress" : "pending"),
  };

  if (layer === 3 || layer === 4) {
    normalized.estimatedMinutes = clampMinutes(node?.estimatedMinutes, 15, 120, 20);
    normalized.achieveTips = normalizeAchieveTips(node?.achieveTips, title, parentTitle);
    normalized.status = normalizeStatus(node?.status, "pending");
    return normalized;
  }

  const children = Array.isArray(node?.children) ? node.children : [];
  if (children.length === 0) {
    throw new Error("AI가 목표 트리를 완성하지 못했어요. 다시 시도해주세요.");
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
    throw new Error("AI가 더 작은 Task를 만들지 못했어요. 다시 시도해주세요.");
  }

  return tasks.slice(0, 3).map((item, index) => {
    const title = normalizeTaskTitle(item?.title || item?.task || "");
    if (!title) {
      throw new Error("AI 응답이 비어 있거나 Task가 없어요. 다시 시도해주세요.");
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

async function callGeminiApi(mode, payload) {
  let response;
  try {
    response = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, ...payload }),
    });
  } catch {
    throw new Error("Gemini API에 연결하지 못했어요. 잠시 후 다시 시도해주세요.");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || "Gemini 응답을 받아오지 못했어요. 잠시 후 다시 시도해주세요.");
  }

  return data;
}

async function requestGoalTree(payload) {
  const data = await callGeminiApi("tree", payload);
  return normalizeGoalTree(data?.tree, payload.goal);
}

async function requestSubTasks(payload) {
  const data = await callGeminiApi("subdivide", payload);
  return normalizeSubTasks(data?.tasks);
}

async function requestAssist(payload) {
  const data = await callGeminiApi("assist", payload);
  return sanitizeAssistText(data?.answer || "");
}

function ActionButton({ children, className = "", icon: Icon, ...props }) {
  return (
    <button
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 font-black transition duration-200 focus:outline-none focus:ring-4 focus:ring-sk-orange/15 disabled:cursor-not-allowed disabled:opacity-55 ${className}`}
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" className="h-5 w-5 shrink-0" /> : null}
      <span>{children}</span>
    </button>
  );
}

function ErrorBanner({ message, onRetry }) {
  if (!message) {
    return null;
  }

  return (
    <div className="rounded-[24px] border border-red-100 bg-red-50 p-4 text-sm text-red-950">
      <div className="flex items-start gap-3">
        <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-sk-red" />
        <div className="min-w-0 flex-1">
          <p className="font-black">앗, 문제가 생겼어요. 다시 시도해주세요.</p>
          <p className="mt-1 break-keep text-red-900/75">{message}</p>
        </div>
        {onRetry ? (
          <button
            className="shrink-0 rounded-full border border-red-200 bg-white px-3 py-2 text-xs font-black text-sk-red transition hover:border-sk-orange hover:text-sk-orange"
            onClick={onRetry}
            type="button"
          >
            다시 시도
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AppHeader({ onLogoClick, onProjectsClick }) {
  return (
    <header className="border-b border-zinc-200/70 bg-white px-5 py-7 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between">
        <button className="inline-flex items-baseline gap-1 font-black" onClick={onLogoClick} type="button">
          <span className="text-xl text-sk-orange sm:text-2xl">Achiever</span>
          <span className="text-xl text-sk-red sm:text-2xl">AI</span>
        </button>

        <div className="hidden items-center gap-12 text-base font-black text-black lg:flex">
          <button className="transition hover:text-[#EA002C]" onClick={onLogoClick} type="button">
            프로젝트 생성
          </button>
          <button className="transition hover:text-[#EA002C]" onClick={onProjectsClick} type="button">
            프로젝트 목록
          </button>
        </div>

        <button
          className="rounded-full bg-black px-4 py-2 text-sm font-black text-white transition hover:bg-zinc-800 sm:px-5"
          onClick={() => window.alert("현재 Achiever AI는 베타 버전이어서 로그인 기능을 지원하지 않습니다.")}
          type="button"
        >
          Log In
        </button>
      </div>
      <nav className="mx-auto mt-5 grid w-full max-w-[1600px] grid-cols-2 gap-2 lg:hidden">
        <button
          className="h-11 rounded-full border border-zinc-200 bg-white text-sm font-black text-zinc-900 transition hover:border-[#EA002C] hover:text-[#EA002C]"
          onClick={onLogoClick}
          type="button"
        >
          프로젝트 생성
        </button>
        <button
          className="h-11 rounded-full border border-zinc-200 bg-white text-sm font-black text-zinc-900 transition hover:border-[#EA002C] hover:text-[#EA002C]"
          onClick={onProjectsClick}
          type="button"
        >
          프로젝트 목록
        </button>
      </nav>
    </header>
  );
}

function Shell({ children, onLogoClick, onProjectsClick }) {
  return (
    <main className="min-h-screen bg-[#F5F7FA] text-zinc-950">
      <AppHeader onLogoClick={onLogoClick} onProjectsClick={onProjectsClick} />
      <div className="bg-[#F5F7FA]">
        <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-[1600px] flex-col px-4 pb-24 pt-6 sm:px-8 sm:pb-10 sm:pt-9 lg:px-10">
          {children}
        </div>
      </div>
    </main>
  );
}

function ProgressBar({ done, total }) {
  const percent = total > 0 ? Math.min(100, (done / total) * 100) : 0;

  return (
    <div className="fixed left-0 top-0 z-50 h-1 w-full bg-zinc-200">
      <div className="h-full bg-[#EA002C] transition-all duration-500" style={{ width: `${percent}%` }} />
    </div>
  );
}

function ProjectListScreen({ projects, activeProjectId, onCreateProject, onSelectProject, onDeleteProject, onLogoClick, onProjectsClick }) {
  return (
    <Shell onLogoClick={onLogoClick} onProjectsClick={onProjectsClick}>
      <section className="flex flex-1 flex-col py-8 sm:py-12">
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#FFF1F2] px-4 py-2 text-sm font-black text-[#EA002C]">
              <FolderOpen aria-hidden="true" className="h-4 w-4" />
              프로젝트 보관함
            </div>
            <h1 className="text-3xl font-black text-black sm:text-5xl">모든 프로젝트</h1>
          </div>

          <ActionButton className="w-full bg-[#EA002C] text-white hover:bg-[#D90029] sm:w-auto" icon={Plus} onClick={onCreateProject} type="button">
            새 프로젝트
          </ActionButton>
        </div>

        {projects.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-[34px] bg-[#f3f3f3] p-8 text-center">
            <div className="max-w-xl">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#EA002C] shadow-[0_16px_40px_rgba(0,0,0,0.08)]">
                <Plus aria-hidden="true" className="h-7 w-7" />
              </div>
              <h2 className="text-3xl font-black text-black">아직 프로젝트가 없습니다</h2>
              <p className="mt-3 break-keep text-base font-semibold leading-7 text-zinc-500">
                목표를 하나 만들면 MAP, 현재 Task, 진행률이 프로젝트 단위로 저장됩니다.
              </p>
              <ActionButton className="mx-auto mt-6 bg-sk-red text-white hover:bg-[#d90029]" icon={Plus} onClick={onCreateProject} type="button">
                첫 프로젝트 만들기
              </ActionButton>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                isActive={project.id === activeProjectId}
                onDelete={() => onDeleteProject(project.id)}
                onSelect={() => onSelectProject(project.id)}
                project={project}
              />
            ))}
          </div>
        )}
      </section>
    </Shell>
  );
}

function ProjectCard({ project, isActive, onSelect, onDelete }) {
  const progress = getProgress(project.goalTree);

  return (
    <article className={`group rounded-[28px] bg-white p-3 shadow-[0_1px_0_rgba(0,0,0,0.04)] ring-1 transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(0,0,0,0.08)] ${isActive ? "ring-[#EA002C]/40" : "ring-zinc-100"}`}>
      <button className="block w-full text-left" onClick={onSelect} type="button">
        <div className="relative flex aspect-[16/7] items-center justify-center overflow-hidden rounded-[20px] bg-[#f3f3f3]">
          <MiniProjectPreview project={project} />
          {isActive ? (
            <span className="absolute left-3 top-3 rounded-full bg-[#EA002C] px-3 py-1 text-xs font-black text-white">
              진행 중
            </span>
          ) : null}
        </div>

        <div className="px-1 pt-4">
          <h2 className="line-clamp-2 min-h-[3rem] break-keep text-lg font-black leading-6 text-black">
            {project.title || "제목 없음"}
          </h2>
          <p className="mt-2 text-sm font-bold text-zinc-500">{formatRelativeTime(project.updatedAt)}</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-[#EA002C]" style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="mt-2 text-xs font-black text-zinc-400">
            전체 {progress.total}개 중 {progress.done}개 완료
          </p>
        </div>
      </button>

      <div className="mt-3 flex justify-end">
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full px-3 text-xs font-black text-zinc-400 transition hover:bg-red-50 hover:text-sk-red"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          type="button"
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          삭제
        </button>
      </div>
    </article>
  );
}

function MiniProjectPreview({ project }) {
  const children = project.goalTree?.children || [];
  const colors = children.slice(0, 4).map((child) => NODE_COLORS[child.layer] || "#EA002C");

  return (
    <div className="relative h-20 w-36">
      <span className="absolute left-1/2 top-0 h-5 w-16 -translate-x-1/2 rounded-md bg-[#EA002C]/15" />
      <span className="absolute left-1/2 top-5 h-8 w-px -translate-x-1/2 bg-zinc-300" />
      {colors.map((color, index) => (
        <span
          key={`${project.id}-preview-${index}`}
          className="absolute top-12 h-5 w-9 rounded-md opacity-80"
          style={{
            backgroundColor: color,
            left: `${index * 34}px`,
          }}
        />
      ))}
    </div>
  );
}

function GoalInputScreen({
  goal,
  deadline,
  obstacle,
  intakeStep,
  error,
  isLoading,
  onGoalChange,
  onDeadlineChange,
  onObstacleChange,
  onExampleClick,
  onEditStep,
  onSubmit,
  onLogoClick,
  onProjectsClick,
}) {
  const copy = QUESTION_COPY[intakeStep];
  const value = intakeStep === 0 ? goal : intakeStep === 1 ? deadline : obstacle;
  const onChange =
    intakeStep === 0 ? onGoalChange : intakeStep === 1 ? onDeadlineChange : onObstacleChange;
  const examples =
    intakeStep === 0 ? EXAMPLE_GOALS : intakeStep === 1 ? EXAMPLE_DEADLINES : EXAMPLE_OBSTACLES;
  const exampleLabel = intakeStep === 0 ? "예시 목표" : intakeStep === 1 ? "예시 기한" : "예시 어려움";
  const handleExampleClick =
    intakeStep === 0 ? onExampleClick : intakeStep === 1 ? onDeadlineChange : onObstacleChange;
  const answeredSteps = [
    { label: "목표", question: "무엇을 이루고 싶으신가요?", answer: goal },
    { label: "기한", question: "언제까지 달성하고 싶으신가요?", answer: deadline },
    { label: "어려움", question: "예상되는 가장 큰 어려움은 무엇인가요?", answer: obstacle },
  ].slice(0, intakeStep).filter((step) => step.answer.trim());

  return (
    <Shell onLogoClick={onLogoClick} onProjectsClick={onProjectsClick}>
      <section id="goal-entry" className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-[1120px] py-9 sm:py-14 lg:py-16">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#FFF1F2] px-4 py-2 text-sm font-black text-[#EA002C]">
                <Sparkles aria-hidden="true" className="h-4 w-4" />
                Achiever AI
              </div>
              <h1 className="max-w-3xl break-keep text-4xl font-black leading-tight text-black sm:text-5xl lg:text-6xl">
                목표를 계층형 실행 지도로
              </h1>
            </div>
            <p className="max-w-md break-keep text-base font-semibold leading-7 text-zinc-500">
              목표를 L2 전략과 L3 실행 Task로 분해해 지금 할 일 하나에 집중합니다.
            </p>
          </div>

          <form className="space-y-5" onSubmit={onSubmit}>
            <div>
              <label className="mb-3 block text-sm font-black text-zinc-500" htmlFor="goal-input">
                {copy.title}
              </label>
              <div className="rounded-[34px] bg-white p-3 shadow-[0_18px_45px_rgba(0,0,0,0.08)] ring-1 ring-zinc-100">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    id="goal-input"
                    className="h-16 min-w-0 flex-1 rounded-full border-0 bg-transparent px-5 text-lg font-bold text-zinc-950 outline-none placeholder:text-zinc-400 sm:px-8"
                    placeholder={copy.placeholder}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    disabled={isLoading}
                  />
                  <button
                    className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#EA002C] px-6 text-sm font-black text-white transition hover:bg-[#D90029] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                    disabled={isLoading}
                    type="submit"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
                        목표를 분석하고 있어요...
                      </>
                    ) : (
                      <>
                        {copy.button}
                        <ArrowRight aria-hidden="true" className="h-5 w-5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <ErrorBanner message={error} />
          </form>
        </div>

        <div className="mx-[calc(50%-50vw)] flex-1 bg-[#f3f3f3]">
          <div className="mx-auto grid w-full max-w-[1600px] gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:px-10 lg:py-14">
            <div className="relative">
              <div className="absolute left-0 top-1 h-16 w-16 rounded-full bg-sk-red/10" />
              <p className="relative pt-4 text-xl font-black leading-7 text-black">
                예시 목표를
                <br />
                선택해보세요.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {EXAMPLE_GOALS.map((example) => (
                <button
                  key={example}
                  className="min-h-28 rounded-[22px] bg-white px-6 py-5 text-left text-lg font-black text-black shadow-[0_1px_0_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:text-sk-red hover:shadow-[0_14px_35px_rgba(0,0,0,0.08)] disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={isLoading || intakeStep !== 0}
                  onClick={() => onExampleClick(example)}
                  type="button"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </Shell>
  );
}

function SimpleGoalInputScreen({
  goal,
  deadline,
  obstacle,
  intakeStep,
  error,
  isLoading,
  onGoalChange,
  onDeadlineChange,
  onObstacleChange,
  onExampleClick,
  onEditStep,
  onSubmit,
  onLogoClick,
  onProjectsClick,
}) {
  const copy =
    intakeStep === 0
      ? {
          title: "무엇을 이루고 싶으신가요?",
          placeholder: "예: 5kg 감량하기",
          button: "분석 시작",
        }
      : intakeStep === 1
        ? {
            title: "언제까지 달성하고 싶으신가요?",
            placeholder: "예: 3주 안에, 이번 달 말까지",
            button: "다음 질문",
          }
        : {
            title: "예상되는 가장 큰 어려움은 무엇인가요?",
            placeholder: "예: 시간이 부족해요, 어디서 시작할지 모르겠어요",
            button: "분석 시작",
          };
  const value = intakeStep === 0 ? goal : intakeStep === 1 ? deadline : obstacle;
  const onChange =
    intakeStep === 0 ? onGoalChange : intakeStep === 1 ? onDeadlineChange : onObstacleChange;
  const examples =
    intakeStep === 0 ? EXAMPLE_GOALS : intakeStep === 1 ? EXAMPLE_DEADLINES : EXAMPLE_OBSTACLES;
  const exampleLabel = intakeStep === 0 ? "예시 목표" : intakeStep === 1 ? "예시 기한" : "예시 어려움";
  const handleExampleClick =
    intakeStep === 0 ? onExampleClick : intakeStep === 1 ? onDeadlineChange : onObstacleChange;
  const answeredSteps = [
    { label: "목표", question: "무엇을 이루고 싶으신가요?", answer: goal },
    { label: "기한", question: "언제까지 달성하고 싶으신가요?", answer: deadline },
    { label: "어려움", question: "예상되는 가장 큰 어려움은 무엇인가요?", answer: obstacle },
  ].slice(0, intakeStep).filter((step) => step.answer.trim());

  return (
    <Shell onLogoClick={onLogoClick} onProjectsClick={onProjectsClick}>
      <section id="goal-entry" className="relative flex flex-1 items-center justify-center overflow-hidden py-10 sm:py-14">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[860px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(234,0,44,0.16)_0%,rgba(244,119,37,0.08)_34%,rgba(245,247,250,0)_70%)] blur-3xl" />
        <div className="relative z-10 mx-auto w-full max-w-5xl">
          <div className="mb-10 text-center">
            <h1 className="break-keep text-3xl font-black leading-tight text-black sm:text-5xl lg:text-6xl">
              목표는 있는데, 시작이 막막한가요?
            </h1>
            <p className="mx-auto mt-5 max-w-2xl break-keep text-base font-bold leading-7 text-zinc-500 sm:text-lg sm:leading-8">
              막막한 목표를 지금 당장 실행할 수 있는 가장 작은 행동으로 바꿔드립니다.
            </p>
          </div>

          <form className="mx-auto max-w-4xl space-y-5" onSubmit={onSubmit}>
            {answeredSteps.length > 0 ? (
              <div className="grid gap-3">
                {answeredSteps.map((step, index) => (
                  <button
                    key={step.label}
                    className="rounded-[22px] border border-zinc-100 bg-white px-5 py-4 text-left shadow-[0_8px_24px_rgba(0,0,0,0.04)] transition hover:border-[#EA002C]/40 hover:bg-[#fffafa] hover:shadow-[0_12px_30px_rgba(234,0,44,0.10)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isLoading}
                    onClick={() => onEditStep(index)}
                    type="button"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded-full bg-[#FFF1F2] px-3 py-1 text-xs font-black text-[#EA002C]">
                        {step.label}
                      </span>
                      <p className="text-sm font-black text-zinc-500">{step.question}</p>
                    </div>
                    <p className="break-keep text-base font-black text-black">{step.answer}</p>
                  </button>
                ))}
              </div>
            ) : null}

            <label className="block" htmlFor="goal-input">
              <span className="mb-3 block text-base font-black text-black">{copy.title}</span>
              <div className="rounded-[30px] border-2 border-[#EA002C]/30 bg-white p-3 transition focus-within:border-[#EA002C]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    id="goal-input"
                    className="h-16 min-w-0 flex-1 rounded-[22px] border-0 bg-[#fafafa] px-5 text-base font-black text-zinc-950 outline-none placeholder:text-zinc-400 sm:h-20 sm:px-8 sm:text-xl"
                    disabled={isLoading}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={copy.placeholder}
                    value={value}
                  />
                  <button
                    className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-[22px] bg-[#EA002C] px-7 text-base font-black text-white transition hover:bg-[#D90029] disabled:cursor-not-allowed disabled:opacity-50 sm:h-16 sm:w-auto"
                    disabled={isLoading}
                    type="submit"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
                        목표를 분석하고 있어요...
                      </>
                    ) : (
                      <>
                        {copy.button}
                        <ArrowRight aria-hidden="true" className="h-5 w-5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </label>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <span className="mr-1 text-sm font-black text-zinc-500">{exampleLabel}</span>
              {examples.map((example) => (
                <button
                  key={example}
                  className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-black text-zinc-700 transition hover:border-[#EA002C] hover:bg-[#FFF1F2] hover:text-[#EA002C] disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={isLoading}
                  onClick={() => handleExampleClick(example)}
                  type="button"
                >
                  {example}
                </button>
              ))}
            </div>

            <ErrorBanner message={error} />
          </form>
        </div>
      </section>
    </Shell>
  );
}

function TreeMap({ tree, phase, activeTaskId }) {
  const [zoom, setZoom] = useState(() => {
    if (typeof window === "undefined") return 1;
    if (window.innerWidth < 480) return 0.64;
    if (window.innerWidth < 768) return 0.74;
    if (window.innerWidth < 1280) return 0.84;
    return 0.92;
  });
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [scrollContainer, setScrollContainer] = useState(null);
  const layout = useMemo(() => {
    const visibleTree = visibleTreeByPhase(tree, phase);
    const root = d3.hierarchy(visibleTree);
    const treeLayout = d3
      .tree()
      .nodeSize([218, 132])
      .separation((a, b) => (a.parent === b.parent ? 0.98 : 1.02));

    treeLayout(root);

    const nodes = root.descendants();
    const minX = d3.min(nodes, (node) => node.x) || 0;
    const maxX = d3.max(nodes, (node) => node.x) || 0;
    const maxY = d3.max(nodes, (node) => node.y) || 0;
    const width = Math.max(1040, maxX - minX + 340);
    const height = Math.max(540, maxY + 210);

    nodes.forEach((node) => {
      node.renderX = node.x - minX + 170;
      node.renderY = node.y + 92;
    });

    return {
      nodes,
      links: root.links(),
      width,
      height,
    };
  }, [tree, phase]);

  const viewportWidth = Math.round(layout.width * zoom);
  const viewportHeight = Math.round(layout.height * zoom);

  useEffect(() => {
    if (!scrollContainer) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      if (scrollContainer.scrollWidth > scrollContainer.clientWidth) {
        scrollContainer.scrollLeft = Math.max(0, (scrollContainer.scrollWidth - scrollContainer.clientWidth) / 2);
      }

      if (phase <= 2) {
        scrollContainer.scrollTop = 0;
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [phase, scrollContainer, viewportWidth, viewportHeight]);

  function updateZoom(nextZoom) {
    setZoom(Math.min(1.4, Math.max(0.55, Number(nextZoom.toFixed(2)))));
  }

  function getTitleLineMax(data) {
    if (data.layer === 1) return 20;
    if (data.layer === 2) return 18;
    return 16;
  }

  function getTitleLines(data) {
    return wrapTitleLines(data.title, getTitleLineMax(data));
  }

  function getBoxSize(data) {
    const lineCount = getTitleLines(data).length;
    const width = data.layer === 1 ? 230 : data.layer === 2 ? 210 : 190;
    const minHeight = data.layer === 1 ? 82 : data.layer === 2 ? 78 : 74;

    return {
      width,
      height: Math.max(minHeight, 48 + lineCount * 18),
    };
  }

  function toggleSelectedNode(nodeId) {
    setSelectedNodeId((currentId) => (currentId === nodeId ? "" : nodeId));
  }

  const renderNodes = [...layout.nodes].sort((a, b) => {
    if (a.data.id === selectedNodeId) return 1;
    if (b.data.id === selectedNodeId) return -1;
    return 0;
  });

  return (
    <div className="relative flex min-h-[560px] flex-1 overflow-hidden rounded-[28px] border border-zinc-100 bg-white shadow-[0_18px_52px_rgba(15,23,42,0.06)] sm:min-h-[620px] sm:rounded-[34px] lg:min-h-[calc(100vh-260px)]">
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-full border border-zinc-200 bg-white/90 p-1 shadow-[0_12px_30px_rgba(0,0,0,0.08)] backdrop-blur">
        <button
          aria-label="MAP 축소"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-black text-zinc-800 transition hover:bg-[#FFF1F2] hover:text-[#EA002C]"
          onClick={() => updateZoom(zoom - 0.1)}
          type="button"
        >
          -
        </button>
        <button
          aria-label={"MAP 확대율 " + Math.round(zoom * 100) + "%, 클릭하면 100%로 초기화"}
          className="inline-flex h-9 min-w-14 items-center justify-center rounded-full bg-zinc-50 px-3 text-xs font-black text-zinc-700 transition hover:bg-[#FFF1F2] hover:text-[#EA002C]"
          onClick={() => updateZoom(1)}
          type="button"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          aria-label="MAP 확대"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-black text-zinc-800 transition hover:bg-[#FFF1F2] hover:text-[#EA002C]"
          onClick={() => updateZoom(zoom + 0.1)}
          type="button"
        >
          +
        </button>
      </div>

      <div ref={setScrollContainer} className="tree-map-scroll flex-1 overflow-auto p-5 pt-16 sm:p-8 sm:pt-20">
        <svg
          aria-label="목표 트리 MAP"
          className="tree-map-canvas"
          height={viewportHeight}
          role="img"
          viewBox={"0 0 " + layout.width + " " + layout.height}
          width={viewportWidth}
        >
          <g>
            <g>
              {layout.links.map((link) => {
                const source = link.source;
                const target = link.target;
                const sourceSize = getBoxSize(source.data, source.data.id === selectedNodeId);
                const targetSize = getBoxSize(target.data, target.data.id === selectedNodeId);
                const midY = (source.renderY + target.renderY) / 2;

                return (
                  <path
                    key={source.data.id + "-" + target.data.id}
                    d={
                      "M " +
                      source.renderX +
                      " " +
                      (source.renderY + sourceSize.height / 2 - 2) +
                      " C " +
                      source.renderX +
                      " " +
                      midY +
                      ", " +
                      target.renderX +
                      " " +
                      midY +
                      ", " +
                      target.renderX +
                      " " +
                      (target.renderY - targetSize.height / 2 + 2)
                    }
                    fill="none"
                    stroke="#E4E4E7"
                    strokeLinecap="round"
                    strokeWidth="4"
                  />
                );
              })}
            </g>
            <g>
              {renderNodes.map((node) => {
                const data = node.data;
                const isDone = data.status === "done";
                const isActive = data.id === activeTaskId;
                const isSelected = data.id === selectedNodeId;
                const color = isDone ? NODE_COLORS.done : NODE_COLORS[data.layer];
                const { width: boxWidth, height: boxHeight } = getBoxSize(data, isSelected);
                const boxX = -boxWidth / 2;
                const boxY = -boxHeight / 2;
                const titleLines = getTitleLines(data);
                const titleStartY = 3 - ((titleLines.length - 1) * 18) / 2;

                return (
                  <g
                    key={data.id}
                    aria-label={data.title}
                    className="tree-node-fade cursor-pointer"
                    onClick={() => toggleSelectedNode(data.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleSelectedNode(data.id);
                      }
                    }}
                    role="button"
                    style={{ animationDelay: Math.min(data.layer * 80, 320) + "ms" }}
                    tabIndex={0}
                    transform={"translate(" + node.renderX + ", " + node.renderY + ")"}
                  >
                    <title>{data.title}</title>
                    <rect
                      className={isActive ? "active-node-box-pulse" : ""}
                      fill="#ffffff"
                      height={boxHeight}
                      rx="18"
                      stroke={isDone ? NODE_COLORS.done : color}
                      strokeWidth={isDone || isActive ? 4 : 2}
                      width={boxWidth}
                      x={boxX}
                      y={boxY}
                    />
                    <rect
                      fill={color}
                      height="6"
                      rx="3"
                      width={boxWidth - 28}
                      x={boxX + 14}
                      y={boxY + 12}
                    />
                    {isDone ? (
                      <text fill={NODE_COLORS.done} fontSize="16" fontWeight="900" textAnchor="end" x={boxWidth / 2 - 14} y={boxY + 36}>
                        ✓
                      </text>
                    ) : null}
                    <text fill="#18181B" fontSize="13" fontWeight="900" textAnchor="middle" x="0" y={titleStartY}>
                      {titleLines.map((line, index) => (
                        <tspan key={data.id + "-line-" + index} x="0" dy={index === 0 ? 0 : 18}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                  </g>
                );
              })}
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}

function MapScreen({ tree, activeTaskId, mapPhase, progress, onMapPhaseChange, onViewTask, onReset, onLogoClick, onProjectsClick }) {
  useEffect(() => {
    if (mapPhase < 3) {
      const timer = window.setTimeout(() => onMapPhaseChange(mapPhase + 1), mapPhase === 1 ? 900 : 1200);
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [mapPhase, onMapPhaseChange]);

  const phaseCopy =
    mapPhase === 1
      ? "궁극적 목표를 먼저 확인하고 있어요."
      : mapPhase === 2
        ? "달성 전략을 펼치고 있어요."
        : "실행 Task까지 준비됐어요.";

  return (
    <>
      <ProgressBar done={progress.done} total={progress.total} />
      <Shell onLogoClick={onLogoClick} onProjectsClick={onProjectsClick}>
        <section className="flex flex-1 flex-col gap-5">
          <header className="rounded-[24px] bg-white/95 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.05)] backdrop-blur sm:rounded-[28px] sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-black text-[#EA002C]">{phaseCopy}</p>
                <h1 className="mt-1 break-keep text-2xl font-black text-black sm:text-4xl">
                  {tree.title}
                </h1>
              </div>
              <div className="min-w-0 sm:min-w-[220px]">
                <p className="mb-2 text-sm font-black text-zinc-500">
                  전체 {progress.total}개 중 {progress.done}개 완료
                </p>
                <div className="h-3 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-[#EA002C] transition-all duration-500"
                    style={{ width: progress.percent + "%" }}
                  />
                </div>
              </div>
            </div>
          </header>

          <div className="relative flex min-h-[620px] flex-1 rounded-[30px] bg-[#EEF1F5] p-2 sm:min-h-[680px] sm:rounded-[36px] sm:p-4 lg:min-h-[calc(100vh-232px)]">
            <TreeMap tree={tree} phase={mapPhase} activeTaskId={activeTaskId} />

            <div className="pointer-events-none absolute bottom-5 left-5 right-5 z-20 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-end">
              <ActionButton
                className="pointer-events-auto w-full border border-zinc-200 bg-white/95 text-zinc-700 shadow-[0_12px_28px_rgba(0,0,0,0.08)] backdrop-blur hover:border-sk-orange hover:text-black sm:w-auto"
                icon={RotateCcw}
                onClick={onReset}
                type="button"
              >
                새로운 목표 시작하기
              </ActionButton>

              {mapPhase >= 3 ? (
                <ActionButton
                  className="pointer-events-auto w-full bg-sk-red text-white shadow-[0_16px_34px_rgba(234,0,44,0.25)] hover:bg-[#d90029] sm:w-auto"
                  onClick={onViewTask}
                  type="button"
                >
                  시작하기 →
                </ActionButton>
              ) : (
                <p className="pointer-events-auto rounded-full bg-white/90 px-5 py-3 text-sm font-black text-zinc-500 shadow-[0_12px_28px_rgba(0,0,0,0.08)] backdrop-blur">
                  목표 지도를 순서대로 펼치고 있어요...
                </p>
              )}
            </div>
          </div>
        </section>

        {mapPhase >= 3 ? <FloatingToggle icon={Zap} label="Task 보기" onClick={onViewTask} /> : null}
      </Shell>
    </>
  );
}

function TaskListNav({ taskEntries, activeTaskId, onSelectTask }) {
  return (
    <aside className="order-2 max-h-[280px] min-h-0 overflow-y-auto rounded-[26px] bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.04)] xl:order-none xl:h-full xl:max-h-none xl:overflow-y-auto">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#FFF1F2] text-[#EA002C]">
          <ListTodo aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-black text-black">Task List</p>
          <p className="text-xs font-bold text-zinc-400">전체 Task를 확인하세요</p>
        </div>
      </div>

      <div className="space-y-2">
        {taskEntries.map(({ task, path }, index) => {
          const isActive = task.id === activeTaskId;
          const isDone = task.status === "done";
          const statusLabel = isDone ? "완료" : isActive ? "진행 중" : "대기";

          return (
            <button
              key={task.id}
              className={`w-full rounded-[18px] border px-3 py-3 text-left transition ${
                isActive
                  ? "border-[#EA002C] bg-[#FFF1F2] shadow-[0_10px_26px_rgba(234,0,44,0.14)]"
                  : isDone
                    ? "border-emerald-100 bg-emerald-50/70 hover:border-emerald-300"
                    : "border-zinc-100 bg-white hover:border-zinc-300 hover:bg-zinc-50"
              }`}
              onClick={() => onSelectTask(task.id)}
              type="button"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-black text-zinc-400">Task {index + 1}</span>
                <span
                  className={`rounded-full px-2 py-1 text-[11px] font-black ${
                    isDone
                      ? "bg-emerald-100 text-emerald-700"
                      : isActive
                        ? "bg-[#EA002C] text-white"
                        : "bg-zinc-100 text-zinc-500"
                  }`}
                >
                  {statusLabel}
                </span>
              </div>
              <p className="line-clamp-2 break-keep text-sm font-black leading-5 text-zinc-950">
                {task.title}
              </p>
              <p className="mt-2 line-clamp-1 break-keep text-xs font-bold text-zinc-400">
                {path.length > 0 ? path.join(" > ") : "경로 없음"}
              </p>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function AssistPanel({
  messages,
  question,
  error,
  isLoading,
  onQuestionChange,
  onSubmit,
}) {
  return (
    <section id="ai-assist" className="flex min-h-[260px] flex-1 flex-col rounded-[22px] bg-[#f7f7f7] p-3 xl:min-h-0">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles aria-hidden="true" className="h-4 w-4 text-sk-orange" />
        <h2 className="text-sm font-black text-black">Achiever AI 채팅</h2>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {messages.length === 0 && !isLoading ? (
          <p className="break-keep text-xs font-bold leading-5 text-zinc-500">
            현재 Task에 대해 궁금한 점이나 막히는 부분, 구체화 방법 등을 자유롭게 물어보세요.
          </p>
        ) : null}

        {messages.map((message, index) => (
          <div
            key={message.role + "-" + index + "-" + message.content.slice(0, 16)}
            className={`rounded-[16px] border px-3 py-2 text-xs leading-5 ${
              message.role === "user"
                ? "border-transparent bg-white text-zinc-700"
                : "border-sk-orange/15 bg-[#fff1ea] text-zinc-950"
            }`}
          >
            <p className="mb-1 text-xs font-black text-zinc-400">
              {message.role === "user" ? "나" : "Achiever AI"}
            </p>
            <p className="whitespace-pre-line break-keep">{sanitizeAssistText(message.content)}</p>
          </div>
        ))}

        {isLoading ? (
          <div className="flex items-center gap-2 rounded-[18px] bg-white px-3 py-3 text-sm font-bold text-zinc-600">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-sk-orange" />
            실행 방법을 생각하고 있어요...
          </div>
        ) : null}

        {error ? (
          <p className="rounded-[18px] border border-red-100 bg-red-50 px-3 py-3 text-sm leading-6 text-red-950">
            {error}
          </p>
        ) : null}
      </div>

      <form className="mt-3 flex gap-2" onSubmit={onSubmit}>
        <input
          className="h-10 min-w-0 flex-1 rounded-full border border-transparent bg-white px-4 text-xs font-semibold text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-sk-orange/30 focus:ring-4 focus:ring-sk-orange/10"
          disabled={isLoading}
          onChange={(event) => onQuestionChange(event.target.value)}
          placeholder="Task에 대해 자유롭게 물어보세요"
          value={question}
        />
        <button
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-sk-red px-3 text-xs font-black text-white transition hover:bg-[#d90029] disabled:cursor-not-allowed disabled:opacity-45"
          disabled={isLoading || !question.trim()}
          type="submit"
        >
          <Send aria-hidden="true" className="h-4 w-4" />
          질문하기
        </button>
      </form>
    </section>
  );
}

function TaskScreen({
  tree,
  activeEntry,
  taskEntries,
  progress,
  startTime,
  error,
  isSubdividing,
  assistMessages,
  assistQuestion,
  assistError,
  isAssistLoading,
  onComplete,
  onAssistQuestionChange,
  onAssistSubmit,
  onSubdivide,
  onSelectTask,
  onRetrySubdivide,
  onViewMap,
  onReset,
  onLogoClick,
  onProjectsClick,
}) {
  const task = activeEntry?.task;
  const path = activeEntry?.path || [];
  const isTaskDone = task?.status === "done";
  const parentGoal = path[path.length - 1] || tree.title;
  const achieveTips = normalizeAchieveTips(task?.achieveTips, task?.title, parentGoal);
  const [isDesktopTaskLayout, setIsDesktopTaskLayout] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 1280,
  );
  const [taskBoardHeight, setTaskBoardHeight] = useState(() =>
    typeof window === "undefined" ? 560 : Math.max(420, window.innerHeight - 224),
  );

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const previousOverflow = document.body.style.overflow;
    const updateTaskBoardLayout = () => {
      const isDesktop = window.innerWidth >= 1280;
      setIsDesktopTaskLayout(isDesktop);
      setTaskBoardHeight(Math.max(420, window.innerHeight - 224));
      document.body.style.overflow = isDesktop ? "hidden" : previousOverflow;
    };

    updateTaskBoardLayout();
    window.addEventListener("resize", updateTaskBoardLayout);

    return () => {
      window.removeEventListener("resize", updateTaskBoardLayout);
      document.body.style.overflow = previousOverflow;
    };
  }, [task?.id]);

  return (
    <>
      <ProgressBar done={progress.done} total={progress.total} />
      <Shell onLogoClick={onLogoClick} onProjectsClick={onProjectsClick}>
        <header className="mb-4 flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-[#EA002C]">
              전체 {progress.total}개 중 {progress.done}개 완료
            </p>
            <h1 className="mt-1 break-keep text-xl font-black text-black sm:text-3xl">
              {tree.title}
            </h1>
          </div>
          <ActionButton
            className="w-full border border-zinc-200 bg-white text-zinc-700 hover:border-sk-orange hover:text-black sm:w-auto"
            icon={RotateCcw}
            onClick={onReset}
            type="button"
          >
            새로운 목표 시작하기
          </ActionButton>
        </header>

        <section
          id="task-board"
          className="grid gap-4 rounded-[28px] bg-[#f3f3f3] p-3 sm:p-5 xl:min-h-0 xl:grid-cols-[260px_minmax(0,1fr)_340px] xl:overflow-hidden xl:rounded-[32px] xl:p-5"
          style={isDesktopTaskLayout ? { height: taskBoardHeight } : undefined}
        >
          <TaskListNav
            activeTaskId={task?.id || ""}
            onSelectTask={onSelectTask}
            taskEntries={taskEntries}
          />

          <div className="order-1 flex min-h-[420px] flex-col justify-center rounded-[26px] bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.04)] sm:min-h-[460px] sm:p-6 xl:order-none xl:min-h-0 xl:overflow-hidden">
            <div className="mx-auto w-full max-w-3xl space-y-4">
              <div className="rounded-[32px] border border-zinc-100 bg-white p-4 shadow-[0_18px_55px_rgba(0,0,0,0.07)] sm:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex max-w-full items-center gap-2 rounded-full bg-[#FFF1F2] px-4 py-2 text-sm font-black text-[#EA002C]">
                    <Target aria-hidden="true" className="h-4 w-4" />
                    <span className="truncate">{parentGoal}</span>
                  </div>
                </div>

                <h2 className="break-keep text-2xl font-black leading-[1.32] tracking-normal text-black sm:text-[2rem]">
                  {task?.title}
                </h2>
                <div className="mt-4 rounded-[20px] bg-[#fafafa] px-4 py-3">
                  <p className="mb-2 text-xs font-black uppercase tracking-normal text-[#EA002C]">
                    Achieve Tip
                  </p>
                  <ol className="space-y-1.5">
                    {achieveTips.map((tip, index) => (
                      <li key={`${task?.id || "task"}-tip-${index}`} className="flex gap-2 break-keep text-xs font-bold leading-5 text-zinc-600">
                        <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-black text-[#EA002C] ring-1 ring-[#EA002C]/15">
                          {index + 1}
                        </span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              <ErrorBanner message={error} onRetry={onRetrySubdivide} />

              <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
                <button
                  className="group flex min-h-[72px] items-center justify-center gap-3 rounded-[24px] border border-[#EA002C] bg-white px-5 py-3 text-left text-zinc-900 transition hover:-translate-y-0.5 hover:bg-[#fffafa] disabled:cursor-not-allowed disabled:opacity-55 sm:h-[72px] sm:px-6"
                  disabled={!task || isTaskDone || isSubdividing}
                  onClick={onComplete}
                  type="button"
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-800">
                    <Check aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-lg font-black">{isTaskDone ? "완료된 Task" : "완료했어요!"}</span>
                    <span className="mt-1 block text-sm font-bold text-zinc-500">다음 Task로 이동합니다</span>
                  </span>
                </button>
                <button
                  className="flex min-h-[72px] items-center justify-center gap-3 rounded-[24px] border border-zinc-200 bg-white px-5 py-3 text-left text-zinc-800 transition hover:-translate-y-0.5 hover:border-sk-orange hover:bg-[#fff7f2] disabled:cursor-not-allowed disabled:opacity-55 sm:h-[72px] sm:px-6"
                  disabled={!task || isSubdividing}
                  onClick={onSubdivide}
                  type="button"
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600">
                    {isSubdividing ? (
                      <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
                    ) : (
                      <Frown aria-hidden="true" className="h-5 w-5" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-base font-black">{isSubdividing ? "쪼개는 중" : "너무 어려워요"}</span>
                    <span className="mt-1 block text-sm font-bold text-zinc-500">더 작은 단계로 나눕니다</span>
                  </span>
                </button>
              </div>
            </div>
          </div>

          <aside className="order-3 flex min-h-0 flex-col gap-3 rounded-[26px] bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.04)] xl:order-none xl:h-full xl:overflow-hidden">
            <div className="grid grid-cols-2 gap-3">
              <InfoRow label="진행 상태" value={"전체 " + progress.total + "개 중 " + progress.done + "개 완료"} />
              <InfoRow label="진행률" value={progress.percent + "%"} />
              <InfoRow label="진행 시간" value={formatDuration(startTime)} />
              <div className="col-span-2">
                <InfoRow label="현재 경로" value={path.length > 0 ? path.join(" > ") : "정해지지 않음"} />
              </div>
            </div>

            <div className="h-px bg-zinc-100" />

            <AssistPanel
              error={assistError}
              isLoading={isAssistLoading}
              messages={assistMessages}
              onQuestionChange={onAssistQuestionChange}
              onSubmit={onAssistSubmit}
              question={assistQuestion}
            />
          </aside>
        </section>

        <FloatingToggle icon={MapIcon} label="MAP 보기" onClick={onViewMap} />
      </Shell>
    </>
  );
}

function FloatingToggle({ icon: Icon, label, onClick }) {
  return (
    <button
      className="fixed bottom-4 right-4 z-40 inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-black px-4 py-3 text-sm font-black text-white shadow-[0_18px_45px_rgba(0,0,0,0.22)] transition hover:-translate-y-0.5 hover:bg-zinc-800 sm:bottom-6 sm:right-6 sm:px-5"
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden="true" className="h-5 w-5" />
      {label}
    </button>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-xs font-black uppercase text-zinc-400">{label}</p>
      <p className="mt-1 break-keep text-sm font-bold leading-6 text-zinc-900">{value}</p>
    </div>
  );
}

function CompletionScreen({ tree, progress, startTime, onReset, onLogoClick, onProjectsClick }) {
  const endTime = Date.now();
  const confettiPieces = useMemo(
    () =>
      Array.from({ length: 32 }, (_, index) => ({
        id: index,
        left: `${5 + ((index * 17) % 90)}%`,
        delay: `${(index % 9) * 0.12}s`,
        x: `${(index % 2 === 0 ? 1 : -1) * (28 + (index % 7) * 9)}px`,
        color: index % 4 === 0 ? "#EA002C" : index % 4 === 1 ? "#F47725" : index % 4 === 2 ? "#EA002C" : "#22C55E",
      })),
    [],
  );

  return (
    <Shell onLogoClick={onLogoClick} onProjectsClick={onProjectsClick}>
      <section className="relative flex flex-1 items-center justify-center overflow-hidden">
        {confettiPieces.map((piece) => (
          <span
            key={piece.id}
            className="confetti-piece absolute top-14 h-3 w-2 rounded-sm"
            style={{
              left: piece.left,
              backgroundColor: piece.color,
              animationDelay: piece.delay,
              "--x": piece.x,
            }}
          />
        ))}

        <div className="relative z-10 w-full max-w-3xl rounded-[32px] bg-white p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.08)] ring-1 ring-zinc-100 sm:p-10">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#FFF1F2] text-[#EA002C]">
            <Sparkles aria-hidden="true" className="h-8 w-8" />
          </div>
          <h1 className="text-4xl font-black text-black sm:text-5xl">해냈어요!</h1>
          <p className="mx-auto mt-4 max-w-xl break-keep text-lg font-semibold leading-8 text-zinc-500">
            {tree.title}
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <ResultCard label="완료한 실행 Task" value={progress.total + "개"} />
            <ResultCard label="소요 기간" value={formatDateTime(startTime) + " ~ " + formatDateTime(endTime)} />
            <ResultCard label="걸린 시간" value={formatDuration(startTime, endTime)} />
          </div>

          <ActionButton
            className="mx-auto mt-8 bg-sk-red text-white shadow-[0_16px_34px_rgba(234,0,44,0.25)] hover:bg-[#d90029]"
            icon={RefreshCw}
            onClick={onReset}
            type="button"
          >
            새로운 목표 시작하기
          </ActionButton>
        </div>
      </section>
    </Shell>
  );
}

function ResultCard({ label, value }) {
  return (
    <div className="rounded-[22px] bg-zinc-50 p-4">
      <p className="text-xs font-black text-zinc-400">{label}</p>
      <p className="mt-2 break-keep text-xl font-black text-black">{value}</p>
    </div>
  );
}

export default function App() {
  const initialState = useMemo(readStoredState, []);
  const initialActiveTaskId = initialState.activeTaskId || findFirstPendingTaskId(initialState.goalTree);
  const initialTree = initialState.goalTree
    ? applyActiveStatus(initialState.goalTree, initialActiveTaskId)
    : null;

  const [projects, setProjects] = useState(initialState.projects);
  const [activeProjectId, setActiveProjectId] = useState(initialState.activeProjectId);
  const [goalTree, setGoalTree] = useState(initialTree);
  const [activeTaskId, setActiveTaskId] = useState(initialActiveTaskId);
  const [startTime, setStartTime] = useState(initialState.startTime);
  const [mapPhase, setMapPhase] = useState(initialState.mapPhase);
  const [view, setView] = useState("goal");

  const [goalInput, setGoalInput] = useState("");
  const [deadlineInput, setDeadlineInput] = useState("");
  const [obstacleInput, setObstacleInput] = useState("");
  const [intakeStep, setIntakeStep] = useState(0);
  const [error, setError] = useState("");
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const [isSubdividing, setIsSubdividing] = useState(false);
  const [assistMessagesByTask, setAssistMessagesByTask] = useState({});
  const [assistQuestion, setAssistQuestion] = useState("");
  const [assistError, setAssistError] = useState("");
  const [isAssistLoading, setIsAssistLoading] = useState(false);

  const progress = useMemo(() => getProgress(goalTree), [goalTree]);
  const taskEntries = useMemo(() => (goalTree ? collectExecutableTasks(goalTree) : []), [goalTree]);
  const activeEntry = useMemo(() => findTaskEntry(goalTree, activeTaskId), [goalTree, activeTaskId]);
  const currentAssistMessages = activeTaskId ? assistMessagesByTask[activeTaskId] || [] : [];
  const isComplete = goalTree && progress.total > 0 && progress.done === progress.total;

  useEffect(() => {
    if (projects.length > 0) {
      localStorage.setItem(STORAGE_KEYS.projects, JSON.stringify(projects));
    } else {
      localStorage.removeItem(STORAGE_KEYS.projects);
    }
  }, [projects]);

  useEffect(() => {
    if (activeProjectId) {
      localStorage.setItem(STORAGE_KEYS.activeProject, activeProjectId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.activeProject);
    }
  }, [activeProjectId]);

  useEffect(() => {
    if (!activeProjectId || !goalTree) {
      return;
    }

    setProjects((previousProjects) =>
      previousProjects.map((project) =>
        project.id === activeProjectId
          ? {
              ...project,
              title: goalTree.title || project.title,
              goalTree,
              activeTaskId,
              startTime,
              mapPhase,
              updatedAt: Date.now(),
            }
          : project,
      ),
    );
  }, [activeProjectId, activeTaskId, goalTree, mapPhase, startTime]);

  useEffect(() => {
    if (goalTree) {
      localStorage.setItem(STORAGE_KEYS.goalTree, JSON.stringify(goalTree));
    } else {
      localStorage.removeItem(STORAGE_KEYS.goalTree);
    }
  }, [goalTree]);

  useEffect(() => {
    if (activeTaskId) {
      localStorage.setItem(STORAGE_KEYS.activeTask, activeTaskId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.activeTask);
    }
  }, [activeTaskId]);

  useEffect(() => {
    if (startTime) {
      localStorage.setItem(STORAGE_KEYS.startTime, String(startTime));
    } else {
      localStorage.removeItem(STORAGE_KEYS.startTime);
    }
  }, [startTime]);

  useEffect(() => {
    if (goalTree) {
      localStorage.setItem(STORAGE_KEYS.mapPhase, String(mapPhase));
    } else {
      localStorage.removeItem(STORAGE_KEYS.mapPhase);
    }
  }, [goalTree, mapPhase]);

  function clearTransientTaskState() {
    setError("");
    setAssistQuestion("");
    setAssistError("");
  }

  async function createGoalTree() {
    const trimmedGoal = goalInput.trim();
    const trimmedDeadline = deadlineInput.trim();
    const trimmedObstacle = obstacleInput.trim();

    setIsLoadingTree(true);
    setError("");

    try {
      const tree = await requestGoalTree({
        goal: trimmedGoal,
        deadline: trimmedDeadline,
        obstacle: trimmedObstacle,
      });
      const firstTaskId = findFirstPendingTaskId(tree);
      const nextTree = applyActiveStatus(tree, firstTaskId);
      const now = Date.now();
      const nextProject = createProjectSnapshot({
        goalTree: nextTree,
        activeTaskId: firstTaskId,
        startTime: now,
        mapPhase: 1,
        createdAt: now,
        updatedAt: now,
      });

      setProjects((previousProjects) => [nextProject, ...previousProjects]);
      setActiveProjectId(nextProject.id);
      setGoalTree(nextTree);
      setActiveTaskId(firstTaskId);
      setStartTime(now);
      setMapPhase(1);
      setView("map");
      setAssistMessagesByTask({});
      clearTransientTaskState();
    } catch (requestError) {
      setError(requestError.message || "앗, 문제가 생겼어요. 다시 시도해주세요.");
    } finally {
      setIsLoadingTree(false);
    }
  }

  function handleGoalSubmit(event) {
    event.preventDefault();

    if (intakeStep === 0) {
      if (!goalInput.trim()) {
        setError("목표를 입력해주세요.");
        return;
      }
      setError("");
      setIntakeStep(1);
      return;
    }

    if (intakeStep === 1) {
      if (!deadlineInput.trim()) {
        setError("목표 기한을 입력해주세요.");
        return;
      }
      setError("");
      setIntakeStep(2);
      return;
    }

    if (!obstacleInput.trim()) {
      setError("예상되는 어려움을 입력해주세요.");
      return;
    }

    createGoalTree();
  }

  function handleCompleteTask() {
    if (!goalTree || !activeTaskId) {
      return;
    }

    const markedTree = markTaskDone(goalTree, activeTaskId);
    const nextTaskId = findFirstPendingTaskId(markedTree);
    const nextTree = applyActiveStatus(markedTree, nextTaskId);

    setGoalTree(nextTree);
    setActiveTaskId(nextTaskId);
    clearTransientTaskState();

    if (nextTaskId) {
      setView("task");
    }
  }

  async function handleSubdivide() {
    if (!goalTree || !activeEntry?.task || isSubdividing) {
      return;
    }

    setIsSubdividing(true);
    setError("");

    try {
      const subTasks = await requestSubTasks({
        currentTask: activeEntry.task.title,
      });
      const replacedTree = replaceTaskWithSubTasks(goalTree, activeEntry.task.id, subTasks);
      const firstSubTaskId = `${activeEntry.task.id}_sub_1`;
      const nextTree = applyActiveStatus(replacedTree, firstSubTaskId);

      setGoalTree(nextTree);
      setActiveTaskId(firstSubTaskId);
      setMapPhase(3);
      clearTransientTaskState();
    } catch (requestError) {
      setError(requestError.message || "앗, 문제가 생겼어요. 다시 시도해주세요.");
    } finally {
      setIsSubdividing(false);
    }
  }

  async function requestAssistAnswer(questionText = "") {
    if (!goalTree || !activeEntry?.task || isAssistLoading) {
      return;
    }

    const taskId = activeEntry.task.id;
    const trimmedQuestion = questionText.trim();
    const history = assistMessagesByTask[taskId] || [];
    const nextMessages = trimmedQuestion
      ? [...history, { role: "user", content: trimmedQuestion }]
      : history;

    setIsAssistLoading(true);
    setAssistError("");

    if (trimmedQuestion) {
      setAssistMessagesByTask((previous) => ({
        ...previous,
        [taskId]: nextMessages,
      }));
    }

    try {
      const answer = sanitizeAssistText(await requestAssist({
        goal: goalTree.title,
        currentTask: activeEntry.task.title,
        path: activeEntry.path.join(" > "),
        question: trimmedQuestion,
        history,
      }));

      setAssistMessagesByTask((previous) => {
        const latestMessages = trimmedQuestion
          ? previous[taskId] || nextMessages
          : previous[taskId] || history;

        return {
          ...previous,
          [taskId]: [...latestMessages, { role: "assistant", content: answer }],
        };
      });
      setAssistQuestion("");
    } catch (requestError) {
      setAssistError(requestError.message || "앗, 문제가 생겼어요. 다시 시도해주세요.");
    } finally {
      setIsAssistLoading(false);
    }
  }

  function handleAssistSubmit(event) {
    event.preventDefault();
    const trimmedQuestion = assistQuestion.trim();

    if (!trimmedQuestion) {
      return;
    }

    requestAssistAnswer(trimmedQuestion);
  }

  function resetGoalDraft() {
    setGoalInput("");
    setDeadlineInput("");
    setObstacleInput("");
    setIntakeStep(0);
    setError("");
    setIsLoadingTree(false);
    setIsSubdividing(false);
    setAssistMessagesByTask({});
    setAssistQuestion("");
    setAssistError("");
  }

  function handleGoHome() {
    setActiveProjectId("");
    setGoalTree(null);
    setActiveTaskId("");
    setStartTime(0);
    setMapPhase(1);
    resetGoalDraft();
    setView("goal");
  }

  function handleOpenProjects() {
    clearTransientTaskState();
    setView("projects");
  }

  function handleCreateProject() {
    handleGoHome();
  }

  function handleSelectProject(projectId) {
    const project = projects.find((item) => item.id === projectId);
    if (!project) {
      return;
    }

    const nextActiveTaskId = project.activeTaskId || findFirstPendingTaskId(project.goalTree);
    const nextTree = applyActiveStatus(project.goalTree, nextActiveTaskId);

    setActiveProjectId(project.id);
    setGoalTree(nextTree);
    setActiveTaskId(nextActiveTaskId);
    setStartTime(project.startTime || Date.now());
    setMapPhase(project.mapPhase || 1);
    resetGoalDraft();
    setView("map");
  }

  function handleDeleteProject(projectId) {
    setProjects((previousProjects) => previousProjects.filter((project) => project.id !== projectId));

    if (projectId === activeProjectId) {
      setActiveProjectId("");
      setGoalTree(null);
      setActiveTaskId("");
      setStartTime(0);
      setMapPhase(1);
      resetGoalDraft();
      setView("projects");
    }
  }

  function handleReset() {
    [
      STORAGE_KEYS.goalTree,
      STORAGE_KEYS.activeTask,
      STORAGE_KEYS.startTime,
      STORAGE_KEYS.mapPhase,
      ...LEGACY_STORAGE_KEYS,
    ].forEach((key) => {
      localStorage.removeItem(key);
    });

    setActiveProjectId("");
    setGoalTree(null);
    setActiveTaskId("");
    setStartTime(0);
    setMapPhase(1);
    setView("goal");
    resetGoalDraft();
  }

  if (view === "projects") {
    return (
      <ProjectListScreen
        activeProjectId={activeProjectId}
        onCreateProject={handleCreateProject}
        onDeleteProject={handleDeleteProject}
        onLogoClick={handleGoHome}
        onProjectsClick={handleOpenProjects}
        onSelectProject={handleSelectProject}
        projects={projects}
      />
    );
  }

  if (view === "goal") {
    return (
      <SimpleGoalInputScreen
        goal={goalInput}
        deadline={deadlineInput}
        obstacle={obstacleInput}
        intakeStep={intakeStep}
        error={error}
        isLoading={isLoadingTree}
        onGoalChange={setGoalInput}
        onDeadlineChange={setDeadlineInput}
        onObstacleChange={setObstacleInput}
        onExampleClick={setGoalInput}
        onEditStep={setIntakeStep}
        onLogoClick={handleGoHome}
        onProjectsClick={handleOpenProjects}
        onSubmit={handleGoalSubmit}
      />
    );
  }

  if (isComplete) {
    return (
      <CompletionScreen
        tree={goalTree}
        progress={progress}
        startTime={startTime}
        onLogoClick={handleGoHome}
        onProjectsClick={handleOpenProjects}
        onReset={handleReset}
      />
    );
  }

  if (goalTree && view === "task") {
    return (
      <TaskScreen
        tree={goalTree}
        activeEntry={activeEntry}
        taskEntries={taskEntries}
        progress={progress}
        startTime={startTime}
        error={error}
        isSubdividing={isSubdividing}
        assistMessages={currentAssistMessages}
        assistQuestion={assistQuestion}
        assistError={assistError}
        isAssistLoading={isAssistLoading}
        onComplete={handleCompleteTask}
        onAssistQuestionChange={setAssistQuestion}
        onAssistSubmit={handleAssistSubmit}
        onSubdivide={handleSubdivide}
        onSelectTask={setActiveTaskId}
        onRetrySubdivide={activeEntry?.task ? handleSubdivide : null}
        onLogoClick={handleGoHome}
        onProjectsClick={handleOpenProjects}
        onViewMap={() => setView("map")}
        onReset={handleReset}
      />
    );
  }

  if (goalTree) {
    return (
      <MapScreen
        tree={goalTree}
        activeTaskId={activeTaskId}
        mapPhase={mapPhase}
        progress={progress}
        onLogoClick={handleGoHome}
        onProjectsClick={handleOpenProjects}
        onMapPhaseChange={setMapPhase}
        onViewTask={() => setView("task")}
        onReset={handleReset}
      />
    );
  }

  return (
    <SimpleGoalInputScreen
      goal={goalInput}
      deadline={deadlineInput}
      obstacle={obstacleInput}
      intakeStep={intakeStep}
      error={error}
      isLoading={isLoadingTree}
      onGoalChange={setGoalInput}
      onDeadlineChange={setDeadlineInput}
      onObstacleChange={setObstacleInput}
      onExampleClick={setGoalInput}
      onEditStep={setIntakeStep}
      onLogoClick={handleGoHome}
      onProjectsClick={handleOpenProjects}
      onSubmit={handleGoalSubmit}
    />
  );
}
