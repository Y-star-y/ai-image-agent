const uploads = document.querySelectorAll("[data-upload]");
const promptForm = document.querySelector("#promptForm");
const statusText = document.querySelector("#statusText");
const resultStrip = document.querySelector("#resultStrip");
const exportButton = document.querySelector("#exportSet");
const workflowLog = document.querySelector("#workflowLog");
const previewDialog = document.querySelector("#previewDialog");
const previewImage = document.querySelector("#previewImage");
const closePreview = document.querySelector("#closePreview");

const imageTypes = [
  "模特正面",
  "模特侧身",
  "生活场景",
  "氛围场景",
  "商品细节",
  "种草封面",
];

const state = {
  directorPlan: [],
  errors: [],
  uploads: {},
  generated: [],
  imageTimings: [],
  prompts: [],
  runStartedAt: null,
  runtimeTimer: null,
  scenes: [],
  workflowStatus: null,
};

const liveStatus = {
  active: false,
  baseText: "",
  timer: null,
};

uploads.forEach((input) => {
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;

    const slot = input.dataset.upload;
    const preview = document.querySelector(`[data-preview="${slot}"]`);
    const card = document.querySelector(`[data-slot="${slot}"]`);
    const url = URL.createObjectURL(file);

    state.uploads[slot] = { file, url };
    preview.src = url;
    card.classList.add("has-image");
    updateStatus();
  });
});

promptForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!state.uploads.front || !state.uploads.face) {
    setStatus("请先上传商品正面图和模特", { stop: true });
    return;
  }

  startRunTracking();
  setLoadingCards();
  setStatus("AI 正在按参考图准备生成", { live: true });
  exportButton.disabled = true;

  try {
    const payload = await buildGeneratePayload();
    state.directorPlan = [];
    state.generated = new Array(imageTypes.length);
    state.errors = [];
    state.prompts = [];
    state.record = null;
    state.scenes = [];

    const response = await fetch("/api/generate-stream", {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      const error = new Error(await response.text());
      error.fromApi = true;
      throw error;
    }

    if (!response.body) {
      throw new Error("当前浏览器不支持流式响应");
    }

    await readGenerateStream(response);
  } catch (error) {
    console.warn(error);
    if (error.fromApi) {
      resetCards();
      const message = formatErrorMessage(error.message);
      setStatus(message, { stop: true });
      return;
    }

    resetCards();
    const message = formatErrorMessage(error.message || "生成失败，请稍后重试");
    setStatus(message, { stop: true });
    exportButton.disabled = true;
  }
});

exportButton.addEventListener("click", async () => {
  const record = state.record || { images: state.generated.filter(Boolean) };
  if (!record.images?.length && !state.generated.filter(Boolean).length) return;

  exportButton.disabled = true;
  const oldText = exportButton.textContent;
  exportButton.textContent = "打包中";

  try {
    await downloadExportZip({
      ...record,
      images: record.images?.length ? record.images : state.generated.filter(Boolean),
    });
    exportButton.textContent = oldText;
    exportButton.disabled = false;
  } catch (error) {
    console.warn(error);
    exportButton.textContent = oldText;
    exportButton.disabled = false;
    setStatus(`导出失败：${error.message || "请稍后重试"}`, { stop: true });
  }
});

closePreview.addEventListener("click", () => {
  previewDialog.close();
});

function updateStatus() {
  const productCount = ["front", "back", "side"].filter((slot) => state.uploads[slot]).length;
  const hasFace = Boolean(state.uploads.face);

  if (productCount === 0 && !hasFace) {
    setStatus("等待上传商品图和模特");
    return;
  }

  setStatus(`已上传商品图 ${productCount}/3，模特 ${hasFace ? "已上传" : "未上传"}`);
}

function setLoadingCards() {
  resultStrip.querySelectorAll(".image-card").forEach((card, index) => {
    card.classList.remove("ready");
    card.classList.remove("failed");
    card.classList.add("is-busy");
    const stage = card.querySelector(".image-stage");
    stage.classList.add("loading");
    stage.innerHTML = loadingStageMarkup(card.dataset.kind, "生成");
    stage.onclick = null;
    const meta = card.querySelector(".image-meta");
    meta.textContent = cardMetaForTiming(index);
  });
}

function resetCards() {
  stopRuntimeTimer();
  resultStrip.querySelectorAll(".image-card").forEach((card, index) => {
    card.classList.remove("ready");
    card.classList.remove("failed");
    card.classList.remove("is-busy");
    const stage = card.querySelector(".image-stage");
    stage.classList.remove("loading");
    stage.innerHTML = `<span>${imageTypes[index]}</span>`;
    stage.onclick = null;
    const meta = card.querySelector(".image-meta");
    meta.textContent = "等待生成";
  });
}

function loadingStageMarkup(kind, action) {
  return `
    <div class="stage-loader">
      <span class="loader-ring"></span>
      <strong>${escapeHtml(kind)}</strong>
      <em>AI 正在${escapeHtml(action)}...</em>
    </div>
  `;
}

function startRunTracking() {
  stopRuntimeTimer();
  const now = Date.now();
  state.runStartedAt = now;
  state.workflowStatus = null;
  state.imageTimings = imageTypes.map(() => ({
    action: "排队等待",
    attempt: 0,
    phase: "queued",
    queuedAt: now,
    updatedAt: now,
  }));
  setWorkflowStatus("任务接入", "准备参考图", "active", {
    completed: 0,
    failed: 0,
    total: imageTypes.length,
  });
  startRuntimeTimer();
}

function startRuntimeTimer() {
  stopRuntimeTimer();
  state.runtimeTimer = window.setInterval(() => {
    if (liveStatus.active) renderLiveStatus();
    renderWorkflowLog();
    refreshRunningCardMeta();
  }, 1000);
}

function stopRuntimeTimer() {
  if (!state.runtimeTimer) return;
  window.clearInterval(state.runtimeTimer);
  state.runtimeTimer = null;
}

function setImageTiming(index, patch = {}) {
  if (!state.imageTimings[index]) {
    state.imageTimings[index] = {
      action: "排队等待",
      attempt: 0,
      phase: "queued",
      queuedAt: state.runStartedAt || Date.now(),
      updatedAt: Date.now(),
    };
  }

  state.imageTimings[index] = {
    ...state.imageTimings[index],
    ...patch,
    updatedAt: Date.now(),
  };
  updateCardMeta(index, cardMetaForTiming(index));
}

function cardMetaForTiming(index) {
  const timing = state.imageTimings[index];
  if (!timing) return "等待生成";

  const waited = formatDuration(secondsBetween(timing.queuedAt, Date.now()));
  const attemptText = timing.attempt > 1 ? ` · 第 ${timing.attempt} 次` : "";

  if (timing.phase === "queued") return `排队中 · ${waited}`;
  if (timing.phase === "generating") return `${timing.action || "生成中"} · ${waited}${attemptText}`;

  return timing.action || "等待生成";
}

function refreshRunningCardMeta() {
  state.imageTimings.forEach((timing, index) => {
    if (!timing || !["queued", "generating"].includes(timing.phase)) {
      return;
    }
    updateCardMeta(index, cardMetaForTiming(index));
  });
}

function completeImageTiming(index, item) {
  const timing = state.imageTimings[index] || {};
  const elapsedSeconds = Number.isFinite(Number(item?.elapsedSeconds))
    ? Number(item.elapsedSeconds)
    : secondsBetween(timing.queuedAt || state.runStartedAt, Date.now());

  setImageTiming(index, {
    action: "完成",
    doneAt: Date.now(),
    elapsedSeconds,
    phase: "done",
  });
}

function failImageTiming(index, error) {
  const timing = state.imageTimings[index] || {};
  const elapsedSeconds = Number.isFinite(Number(error?.elapsedSeconds))
    ? Number(error.elapsedSeconds)
    : secondsBetween(timing.queuedAt || state.runStartedAt, Date.now());

  setImageTiming(index, {
    action: "失败",
    doneAt: Date.now(),
    elapsedSeconds,
    phase: "failed",
  });
}

function setWorkflowStatus(label, detail = "", status = "active", options = {}) {
  if (!workflowLog) return;

  state.workflowStatus = {
    completed: Number.isFinite(Number(options.completed)) ? Number(options.completed) : 0,
    detail,
    elapsedSeconds: Number.isFinite(Number(options.elapsedSeconds)) ? Number(options.elapsedSeconds) : null,
    failed: Number.isFinite(Number(options.failed)) ? Number(options.failed) : 0,
    label,
    status,
    summary: options.summary || "",
    total: Number.isFinite(Number(options.total)) ? Number(options.total) : imageTypes.length,
    updatedAt: Date.now(),
  };
  renderWorkflowLog();
}

function renderWorkflowLog() {
  if (!workflowLog) return;
  workflowLog.innerHTML = "";

  if (!state.workflowStatus) return;

  const item = document.createElement("div");
  const status = ["active", "complete", "error"].includes(state.workflowStatus.status)
    ? state.workflowStatus.status
    : "active";
  item.className = `workflow-status is-${status}`;

  const stateText = status === "complete" ? "完成" : status === "error" ? "异常" : "运行中";
  const elapsedSeconds = state.workflowStatus.elapsedSeconds != null
    ? state.workflowStatus.elapsedSeconds
    : secondsBetween(state.runStartedAt, Date.now());
  const progressText = workflowProgressText(state.workflowStatus);
  item.title = [
    stateText,
    state.workflowStatus.label,
    `已用 ${formatDuration(elapsedSeconds)}`,
    progressText,
    state.workflowStatus.detail,
  ].filter(Boolean).join(" · ");

  const badge = document.createElement("strong");
  badge.textContent = stateText;
  item.appendChild(badge);

  const label = document.createElement("span");
  label.textContent = state.workflowStatus.label;
  item.appendChild(label);

  const meta = document.createElement("em");
  meta.textContent = [`已用 ${formatDuration(elapsedSeconds)}`, progressText, state.workflowStatus.detail]
    .filter(Boolean)
    .join(" · ");
  item.appendChild(meta);

  workflowLog.appendChild(item);
}

function workflowProgressText(status) {
  if (status.summary) return status.summary;
  if (!status.total) return "";
  const completed = Math.max(0, status.completed || 0);
  const failed = Math.max(0, status.failed || 0);
  const base = `${completed}/${status.total} 完成`;
  return failed ? `${base} · 失败 ${failed}` : base;
}

function clearWorkflowLog() {
  state.workflowStatus = null;
  if (workflowLog) workflowLog.innerHTML = "";
}

function setStatus(message, options = {}) {
  const text = cleanProviderText(message);

  if (options.stop) {
    stopLiveStatus(text);
    return;
  }

  if (options.live || liveStatus.active) {
    startLiveStatus(text);
    return;
  }

  statusText.textContent = text;
  statusText.classList.remove("is-live");
}

function startLiveStatus(message) {
  liveStatus.active = true;
  liveStatus.baseText = normalizeLiveStatus(message);
  statusText.classList.add("is-live");
  document.body.classList.add("is-generating");
  renderLiveStatus();

  if (!liveStatus.timer) {
    liveStatus.timer = window.setInterval(renderLiveStatus, 680);
  }
}

function stopLiveStatus(message) {
  liveStatus.active = false;
  liveStatus.baseText = "";
  window.clearInterval(liveStatus.timer);
  liveStatus.timer = null;
  stopRuntimeTimer();
  statusText.textContent = cleanProviderText(message);
  statusText.classList.remove("is-live");
  document.body.classList.remove("is-generating");
}

function renderLiveStatus() {
  const waited = state.runStartedAt ? ` · 已用 ${formatDuration(secondsBetween(state.runStartedAt, Date.now()))}` : "";
  statusText.textContent = `${liveStatus.baseText}${waited}`;
}

function normalizeLiveStatus(message) {
  const text = cleanProviderText(message).replace(/[.。…]+$/g, "");
  if (/^AI\s*正在/.test(text)) return text;
  if (text.startsWith("正在")) return `AI ${text}`;
  if (text.includes("正在")) return text.startsWith("AI") ? text : `AI ${text}`;
  return `AI 正在处理 · ${text}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderResults() {
  resultStrip.querySelectorAll(".image-card").forEach((card, index) => {
    const item = state.generated[index];
    const stage = card.querySelector(".image-stage");
    const meta = card.querySelector(".image-meta");

    card.classList.add("ready");
    card.classList.remove("is-busy");
    stage.classList.remove("loading");
    stage.innerHTML = `<img alt="${item.type}" src="${item.url}" />`;
    stage.onclick = () => openPreview(item.url);
    meta.textContent = metaTextForItem(item, index);
  });
}

async function readGenerateStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const progress = {
    completed: 0,
    completedIndexes: new Set(),
    failed: 0,
    failedIndexes: new Set(),
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      handleStreamEvent(JSON.parse(line), progress);
    }
  }

  if (buffer.trim()) {
    handleStreamEvent(JSON.parse(buffer), progress);
  }
}

function handleStreamEvent(event, progress) {
  if (event.type === "prompt_start") {
    setWorkflowStatus("规划镜头", "编排套图场景", "active", {
      completed: progress.completed,
      failed: progress.failed,
      total: imageTypes.length,
    });
    setStatus(event.message || "AI 正在生成视觉导演方案", { live: true });
    return;
  }

  if (event.type === "prompt_done") {
    state.directorPlan = Array.isArray(event.directorPlan) ? event.directorPlan : state.directorPlan;
    state.scenes = Array.isArray(event.scenes) ? event.scenes : [];
    state.prompts = Array.isArray(event.prompts) ? event.prompts : [];
    setWorkflowStatus("生成中", "6 张图片并发处理", "active", {
      completed: progress.completed,
      failed: progress.failed,
      total: imageTypes.length,
    });
    setStatus(event.message || "AI 正在带参考图生成 6 张图片", { live: true });
    return;
  }

  if (event.type === "image_start") {
    const card = resultStrip.querySelectorAll(".image-card")[event.index];
    const meta = card?.querySelector(".image-meta");
    const attempt = Number(event.attempt || 1);
    setImageTiming(event.index, {
      action: attempt > 1 ? "重试生成中" : "生成中",
      attempt,
      phase: "generating",
      startedAt: Date.now(),
    });
    card?.classList.add("is-busy");
    if (meta) meta.textContent = cardMetaForTiming(event.index);
    setWorkflowStatus("生成中", `${imageTypes[event.index]}处理中`, "active", {
      completed: progress.completed,
      failed: progress.failed,
      total: imageTypes.length,
    });
    setStatus(`AI 正在生成第 ${event.index + 1} 张图片`, { live: true });
    return;
  }

  if (event.type === "image_done") {
    const item = normalizeGeneratedImage(event.image, event.index);
    state.generated[event.index] = item;
    completeImageTiming(event.index, item);
    renderSingleResult(event.index, item);
    if (!progress.completedIndexes.has(event.index)) {
      progress.completedIndexes.add(event.index);
      progress.completed += 1;
    }
    setWorkflowStatus("生成中", "图片陆续完成", "active", {
      completed: progress.completed,
      failed: progress.failed,
      total: imageTypes.length,
    });
    setStatus(`AI 正在并发生成 · 已完成 ${progress.completed}/6${progress.failed ? `，失败 ${progress.failed}` : ""}`, {
      live: true,
    });
    return;
  }

  if (event.type === "image_error") {
    state.errors[event.index] = event.error;
    failImageTiming(event.index, event.error);
    renderSingleError(event.index, event.error);
    if (!progress.failedIndexes.has(event.index)) {
      progress.failedIndexes.add(event.index);
      progress.failed += 1;
    }
    setWorkflowStatus("生成中", "部分图片失败，继续处理", "active", {
      completed: progress.completed,
      failed: progress.failed,
      total: imageTypes.length,
    });
    setStatus(`AI 正在继续处理 · 已完成 ${progress.completed}/6，失败 ${progress.failed}`, { live: true });
    return;
  }

  if (event.type === "done") {
    state.record = event.record || {
      errors: state.errors,
      images: state.generated.filter(Boolean),
    };
    if (state.record.directorPlan) state.directorPlan = state.record.directorPlan;
    exportButton.disabled = state.generated.filter(Boolean).length === 0;
    setWorkflowStatus("完成", "", progress.failed ? "error" : "complete", {
      completed: progress.completed,
      elapsedSeconds: maxGeneratedElapsed(state.record),
      failed: progress.failed,
      summary: progress.failed ? `成功 ${progress.completed} 张 · 失败 ${progress.failed} 张` : `成功 ${progress.completed} 张`,
      total: imageTypes.length,
    });
    setStatus(
      progress.failed
        ? `生成完成：成功 ${progress.completed} 张，失败 ${progress.failed} 张`
        : "已生成 6 张图片，可放大预览或下载导出",
      { stop: true }
    );
    return;
  }

  if (event.type === "error") {
    resetCards();
    setWorkflowStatus("中断", cleanProviderText(event.message || "生成失败"), "error", {
      elapsedSeconds: secondsBetween(state.runStartedAt, Date.now()),
      summary: "生成失败",
      total: imageTypes.length,
    });
    setStatus(event.message || "生成失败", { stop: true });
  }
}

function renderSingleResult(index, item) {
  const card = resultStrip.querySelectorAll(".image-card")[index];
  const stage = card.querySelector(".image-stage");
  const meta = card.querySelector(".image-meta");

  card.classList.add("ready");
  card.classList.remove("failed");
  card.classList.remove("is-busy");
  stage.classList.remove("loading");
  stage.innerHTML = `<img alt="${item.type}" src="${item.url}" />`;
  stage.onclick = () => openPreview(item.url);
  meta.textContent = state.imageTimings[index]?.phase === "done"
    ? metaTextForItem(item, index)
    : cardMetaForTiming(index);
}

function renderSingleError(index, error) {
  const card = resultStrip.querySelectorAll(".image-card")[index];
  const stage = card.querySelector(".image-stage");
  const meta = card.querySelector(".image-meta");

  card.classList.remove("ready");
  card.classList.add("failed");
  card.classList.remove("is-busy");
  stage.classList.remove("loading");
  stage.innerHTML = `
    <div class="failure-actions">
      <strong>生成失败</strong>
      <button class="retry-image-button" type="button" data-retry-index="${index}">刷新</button>
    </div>
  `;
  stage.onclick = null;
  stage.querySelector(".retry-image-button")?.addEventListener("click", () => {
    retryImage(index);
  });
  meta.textContent = error?.elapsedSeconds ? `失败 · ${formatDuration(error.elapsedSeconds)}` : "生成失败";
}

async function retryImage(index) {
  if (!state.uploads.front || !state.uploads.face) {
    setStatus("请先上传商品正面图和模特", { stop: true });
    return;
  }

  const card = resultStrip.querySelectorAll(".image-card")[index];
  const stage = card?.querySelector(".image-stage");
  const meta = card?.querySelector(".image-meta");
  if (!card || !stage || !meta) return;

  card.classList.remove("failed");
  card.classList.add("is-busy");
  state.runStartedAt = Date.now();
  clearWorkflowLog();
  state.imageTimings[index] = {
    action: "重新生成中",
    attempt: 1,
    phase: "generating",
    queuedAt: state.runStartedAt,
    startedAt: state.runStartedAt,
    updatedAt: state.runStartedAt,
  };
  startRuntimeTimer();
  setWorkflowStatus("重新生成", `${imageTypes[index]}处理中`, "active", {
    completed: 0,
    failed: 0,
    total: 1,
  });
  stage.classList.add("loading");
  stage.innerHTML = loadingStageMarkup(imageTypes[index], "重新生成");
  meta.textContent = cardMetaForTiming(index);
  setStatus(`AI 正在重新生成第 ${index + 1} 张`, { live: true });

  try {
    const payload = await buildGeneratePayload();
    const response = await fetch("/api/regenerate-image", {
      body: JSON.stringify({
        ...payload,
        generatedAt: state.record?.generatedAt,
        index,
        prompt: state.prompts?.[index],
        scene: state.scenes?.[index],
        type: state.scenes?.[index]?.title || imageTypes[index],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const result = await response.json();
    const item = normalizeGeneratedImage(result.image, index);
    state.generated[index] = item;
    state.errors[index] = null;
    if (state.record) {
      state.record.images = state.generated.filter(Boolean);
      state.record.errors = state.errors.filter(Boolean);
    }
    completeImageTiming(index, item);
    renderSingleResult(index, item);
    exportButton.disabled = state.generated.filter(Boolean).length === 0;
    setWorkflowStatus("完成", "", "complete", {
      completed: 1,
      elapsedSeconds: item.elapsedSeconds,
      summary: `第 ${index + 1} 张完成`,
      total: 1,
    });
    setStatus(`第 ${index + 1} 张已重新生成`, { stop: true });
  } catch (error) {
    console.warn(error);
    const failure = {
      elapsedSeconds: null,
      index,
      message: formatErrorMessage(error.message || "图片生成失败"),
      type: imageTypes[index],
    };
    state.errors[index] = failure;
    failImageTiming(index, failure);
    renderSingleError(index, failure);
    setWorkflowStatus("失败", cleanProviderText(failure.message), "error", {
      elapsedSeconds: state.imageTimings[index]?.elapsedSeconds,
      failed: 1,
      summary: "重新生成失败",
      total: 1,
    });
    setStatus(`重新生成失败：${cleanProviderText(failure.message)}`, { stop: true });
  }
}

function updateCardMeta(index, text) {
  const card = resultStrip.querySelectorAll(".image-card")[index];
  const meta = card?.querySelector(".image-meta");
  if (meta) meta.textContent = text;
}

function metaTextForItem(item, index) {
  const timing = state.imageTimings[index] || {};
  const elapsedSeconds = Number.isFinite(Number(item.elapsedSeconds))
    ? Number(item.elapsedSeconds)
    : timing.elapsedSeconds;
  const parts = ["完成"];

  if (elapsedSeconds != null) {
    parts.push(formatDuration(elapsedSeconds));
  } else if (item.generatedAt) {
    parts.push(item.generatedAt);
  }

  return parts.join(" · ");
}

function secondsBetween(start, end) {
  const startTime = Number(start);
  const endTime = Number(end);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0;
  return Math.max(0, (endTime - startTime) / 1000);
}

function formatDuration(value) {
  const seconds = Math.max(0, Number(value) || 0);
  if (seconds < 60) {
    if (seconds < 1) return "<1s";
    return `${Math.round(seconds)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m${String(rest).padStart(2, "0")}s`;
}

function maxGeneratedElapsed(record) {
  const items = [
    ...(Array.isArray(record?.images) ? record.images : []),
    ...(Array.isArray(record?.errors) ? record.errors : []),
    ...state.generated.filter(Boolean),
    ...state.errors.filter(Boolean),
  ];
  const values = items
    .map((item) => Number(item?.elapsedSeconds))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (values.length) return Math.max(...values);
  return state.runStartedAt ? secondsBetween(state.runStartedAt, Date.now()) : null;
}

async function buildGeneratePayload() {
  const images = {};

  for (const [slot, item] of Object.entries(state.uploads)) {
    images[slot] = {
      dataUrl: await fileToDataUrl(item.file),
      name: item.file.name,
      type: item.file.type,
    };
  }

  const payload = {
    analysisMode: "reference",
    images,
  };

  return payload;
}

function normalizeGeneratedImage(item, index) {
  return {
    elapsedSeconds: item.elapsedSeconds,
    generatedAt: item.generatedAt || formatGeneratedTime(new Date()),
    index: item.index ?? index,
    prompt: item.prompt || "",
    referencesUsed: item.referencesUsed || [],
    type: item.type || imageTypes[index],
    url: item.url,
  };
}

function openPreview(url) {
  previewImage.src = url;
  previewDialog.showModal();
}

function formatGeneratedTime(date) {
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function downloadExportZip(record) {
  const response = await fetch("/api/export-set", {
    body: JSON.stringify({ record }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, `ai-agent-export-${Date.now()}.zip`);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadDataUrl(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
}

function extensionForUrl(url) {
  if (url.startsWith("data:image/svg")) return "svg";
  if (url.startsWith("data:image/jpeg")) return "jpg";
  if (url.startsWith("data:image/webp")) return "webp";
  return "png";
}

function formatErrorMessage(message) {
  try {
    const parsed = JSON.parse(message);
    return cleanProviderText(parsed.message || parsed.error || "请检查后端配置");
  } catch {
    return cleanProviderText(message || "请检查后端配置");
  }
}

function cleanProviderText(message) {
  return String(message || "")
    .replace(/Doubao/gi, "AI")
    .replace(/豆包/g, "AI")
    .replace(/Seedream/gi, "图片生成服务")
    .replace(/Ark/gi, "AI 服务")
    .trim();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resizeDataUrl(reader.result).then(resolve, reject));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function resizeDataUrl(dataUrl) {
  return new Promise((resolve) => {
    const image = new Image();
    image.addEventListener("load", () => {
      const maxSide = 896;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));

      if (scale >= 1) {
        resolve(dataUrl);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    });
    image.addEventListener("error", () => resolve(dataUrl));
    image.src = dataUrl;
  });
}
