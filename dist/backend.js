// QuickGen 0.1.3 — generated from src/.

// src/model.ts
var emptyStep = (kind) => ({
  connectionId: "",
  workflowId: "",
  presetId: "",
  prompt: "",
  negativePrompt: "",
  fields: {},
  source: "none",
  outputNodeId: "",
  bypassLoras: kind === "video",
  timeoutSeconds: kind === "video" ? 1800 : 300
});
function workflows(connection) {
  const entries = connection?.metadata.comfyui_workflows;
  if (Array.isArray(entries) && entries.length)
    return entries.filter((entry) => !!entry?.id && !!entry?.config?.workflow_api_json);
  const config = connection?.metadata.comfyui;
  return config?.workflow_api_json ? [{ id: "__legacy__", name: "Imported workflow", config }] : [];
}
function supportsSourceImage(workflow) {
  return workflow?.config.field_mappings.some((mapping) => {
    const node = workflow.config.workflow_api_json?.[mapping.nodeId];
    return mapping.mappedAs === "init_image" && !!node?.inputs && Object.hasOwn(node.inputs, mapping.fieldName);
  }) ?? false;
}
function fieldControls(workflow) {
  if (!workflow)
    return [];
  const customKeys = new Set(workflow.config.field_mappings.filter((mapping) => mapping.mappedAs === "custom").map((mapping) => `${mapping.nodeId}:${mapping.fieldName}`));
  const unique = new Map;
  for (const mapping of workflow.config.field_mappings) {
    const key = `${mapping.nodeId}:${mapping.fieldName}`;
    const previous = unique.get(key);
    if (!previous || previous.mappedAs === "custom" && mapping.mappedAs !== "custom")
      unique.set(key, mapping);
  }
  return [...unique.values()].filter((mapping) => !["positive_prompt", "negative_prompt"].includes(mapping.mappedAs)).flatMap((mapping) => {
    if (mapping.mappedAs === "init_image" && !customKeys.has(`${mapping.nodeId}:${mapping.fieldName}`))
      return [];
    const node = workflow.config.workflow_api_json?.[mapping.nodeId];
    const value = node?.inputs[mapping.fieldName];
    if (!["string", "number", "boolean"].includes(typeof value))
      return [];
    const key = `${mapping.nodeId}:${mapping.fieldName}`;
    return [{ key, semantic: mapping.mappedAs, label: `${mapping.fieldName.replaceAll("_", " ")} · ${node?._meta?.title || node?.class_type || mapping.nodeId} (${mapping.nodeId})`, value, options: workflow.config.field_options?.[key] ?? [] }];
  });
}
function normalizeRecipe(raw) {
  const r = raw;
  if (!r || typeof r.id !== "string" || typeof r.name !== "string" || !r.name.trim())
    throw new Error("Recipe needs an ID and name.");
  const normalizeStep = (raw2, kind) => {
    const step = raw2;
    const result = emptyStep(kind);
    for (const key of ["connectionId", "workflowId", "presetId", "prompt", "negativePrompt", "source", "outputNodeId"]) {
      if (typeof step?.[key] === "string")
        result[key] = step[key];
    }
    result.bypassLoras = typeof step?.bypassLoras === "boolean" ? step.bypassLoras : result.bypassLoras;
    result.timeoutSeconds = Math.max(15, Math.min(3600, Number(step?.timeoutSeconds) || result.timeoutSeconds));
    for (const [key, value] of Object.entries(step?.fields ?? {})) {
      if (typeof value === "number" && Number.isFinite(value) || typeof value === "string" || typeof value === "boolean")
        result.fields[key] = value;
    }
    return result;
  };
  return { id: r.id, name: r.name.trim().slice(0, 100), image: normalizeStep(r.image, "image"), video: normalizeStep(r.video, "video") };
}
function buildInput(step, kind, catalog, context) {
  const connection = catalog.connections.find((c) => c.id === step.connectionId);
  if (!connection || connection.provider !== "comfyui")
    throw new Error("Choose an available ComfyUI connection.");
  const workflow = workflows(connection).find((w) => w.id === step.workflowId);
  if (!workflow)
    throw new Error(`Select a saved ${kind} workflow.`);
  const presetId = step.presetId || catalog.activeId;
  if (presetId && !catalog.presets.some((p) => p.id === presetId))
    throw new Error("Selected Main Preset is no longer available.");
  if (!presetId && !step.prompt.trim())
    throw new Error("Select a Main Preset or enter a prompt override.");
  const mappings = workflow.config.field_mappings;
  if (!mappings.some((m) => m.mappedAs === "positive_prompt"))
    throw new Error("Map a positive prompt field in this workflow in ImgGen first.");
  const acceptsSource = supportsSourceImage(workflow);
  const sourceImageId = acceptsSource ? context.sourceImageId : undefined;
  if (acceptsSource && step.source !== "none" && !sourceImageId)
    throw new Error("Choose a source image or generate an image first.");
  const patch = { custom: {}, node_fields: {} };
  for (const field of fieldControls(workflow)) {
    if (field.semantic.startsWith("lora_") && !step.bypassLoras)
      continue;
    if (field.semantic === "init_image" && sourceImageId)
      continue;
    const value = Object.hasOwn(step.fields, field.key) ? step.fields[field.key] : field.value;
    if (typeof value !== typeof field.value || typeof value === "number" && !Number.isFinite(value))
      throw new Error(`Invalid value for ${field.label}.`);
    if (field.options.length && !field.options.includes(String(value)))
      throw new Error(`Choose an available value for ${field.label}.`);
    if (field.semantic === "custom")
      patch.custom[field.key] = value;
    else if (field.semantic === "init_image")
      patch.init_image = value;
    else
      patch.node_fields[field.key] = value;
  }
  return {
    chat_id: context.chatId,
    connection_id: connection.id,
    promptPresetId: presetId || undefined,
    prompt: step.prompt.trim() ? step.prompt : undefined,
    negativePrompt: step.negativePrompt.trim() ? step.negativePrompt : undefined,
    promptMode: presetId ? catalog.presets.find((p) => p.id === presetId).mode : "custom",
    source_image_id: sourceImageId,
    output_media_type: kind,
    output_node_id: step.outputNodeId || undefined,
    clientJobId: context.jobId,
    includeDataUrl: false,
    forceGeneration: true,
    generationTimeoutSeconds: step.timeoutSeconds,
    characterLora: step.bypassLoras ? { source: "none" } : undefined,
    bypassActiveLoraPreset: step.bypassLoras,
    parameters: { workflow_id: workflow.id === "__legacy__" ? undefined : workflow.id, comfyui_field_values: patch }
  };
}
function normalizeSettings(raw) {
  const input = raw;
  if (input?.kind !== "image" && input?.kind !== "video")
    throw new Error("Choose image or video output.");
  const recipe = normalizeRecipe({ id: "launcher", name: "QuickGen", [input.kind]: input.step });
  return { kind: input.kind, step: recipe[input.kind] };
}
function migrateSettings(legacy) {
  const recipe = legacy?.recipes.find((entry) => entry.id === legacy.selectedId) ?? legacy?.recipes[0];
  const kind = recipe?.video.workflowId ? "video" : recipe?.image.workflowId ? "image" : "video";
  return normalizeSettings({ kind, step: recipe?.[kind] ?? emptyStep(kind) });
}

// src/backend.ts
var jobs = new Map;
var locks = new Map;
var activeIds = new Map;
var STATE_PATH = "selection.json";
var LAST_PATH = "last-job.json";
var supported = () => typeof spindle.imageGen.getPromptPresets === "function" && typeof spindle.imageGen.cancelNative === "function";
function send(userId, payload) {
  spindle.sendToFrontend(payload, userId);
}
async function settings(userId) {
  const stored = await spindle.userStorage.getJson(STATE_PATH, { userId, fallback: null });
  if (stored)
    return normalizeSettings(stored);
  const legacy = await spindle.userStorage.getJson("quickgen.json", { userId, fallback: null });
  return migrateSettings(legacy);
}
function withSettings(userId, work) {
  const pending = (locks.get(userId) ?? Promise.resolve()).catch(() => {}).then(work);
  locks.set(userId, pending);
  return pending.finally(() => {
    if (locks.get(userId) === pending)
      locks.delete(userId);
  });
}
async function catalog(userId) {
  if (!supported())
    throw new Error("QuickGen needs the included Lumiverse core patch. Apply it and restart Lumiverse.");
  const [presets, connections] = await Promise.all([
    spindle.imageGen.getPromptPresets(userId),
    spindle.imageGen.listConnections(userId)
  ]);
  return { ...presets, connections: connections.filter((c) => c.provider === "comfyui") };
}
async function assets(userId) {
  if (!spindle.permissions.has("images"))
    return [];
  const list = await spindle.images.list({ limit: 100, userId });
  return list.data.filter((asset) => asset.mime_type.startsWith("image/"));
}
async function lastJob(userId) {
  if (jobs.has(userId))
    return jobs.get(userId);
  const stored = await spindle.userStorage.getJson(LAST_PATH, { userId, fallback: null });
  if (stored?.status === "running" || stored?.status === "cancelling") {
    return { ...stored, status: "failed", error: "QuickGen restarted before completion. Check ComfyUI before retrying; completed assets remain in Lumiverse." };
  }
  return stored;
}
async function start(userId, raw, chatId) {
  if (!spindle.permissions.has("image_gen"))
    throw new Error("Grant QuickGen the Image Generation permission in Spindle.");
  if (typeof chatId !== "string" || !chatId)
    throw new Error("Open a chat before generating.");
  if (jobs.get(userId)?.status === "running" || jobs.get(userId)?.status === "cancelling")
    throw new Error("Wait for the current QuickGen job or cancel it.");
  const selection = normalizeSettings(raw);
  const { kind, step } = selection;
  const previous = await lastJob(userId);
  if (jobs.get(userId)?.status === "running" || jobs.get(userId)?.status === "cancelling")
    throw new Error("QuickGen is already running.");
  const job = { id: crypto.randomUUID(), chatId, recipeName: "QuickGen", mode: kind, phase: kind, status: "running", startedAt: Date.now(), image: kind === "video" ? previous?.image : undefined };
  jobs.set(userId, job);
  const cancelled = () => job.status === "cancelling";
  try {
    const options = await catalog(userId);
    const connection = options.connections.find((entry) => entry.id === step.connectionId);
    const workflow = workflows(connection).find((entry) => entry.id === step.workflowId);
    const selectedSource = !supportsSourceImage(workflow) ? undefined : step.source === "last" ? previous?.image?.imageId : step.source === "none" ? undefined : step.source;
    const input = buildInput(step, kind, options, { chatId, jobId: `${job.id}:${kind}`, sourceImageId: selectedSource });
    job.recipeName = connection?.name ?? "QuickGen";
    await spindle.userStorage.setJson(LAST_PATH, job, { userId });
    send(userId, { type: "qg_job", job });
    (async () => {
      try {
        if (job.status !== "running")
          throw new Error("Generation cancelled");
        activeIds.set(userId, input.clientJobId);
        const generated = await spindle.imageGen.generateNative({ ...input, userId });
        if (!generated.generated || !generated.imageId)
          throw new Error(generated.reason || "The workflow returned no saved output.");
        const result = { imageId: generated.imageId, mediaUrl: generated.mediaUrl ?? generated.imageUrl, mediaType: generated.mediaType ?? kind, mimeType: generated.mimeType ?? (kind === "video" ? "video/mp4" : "image/png"), prompt: generated.prompt, jobId: generated.jobId };
        job[kind] = result;
        job.status = cancelled() ? "cancelled" : "complete";
      } catch (error) {
        job.error = error instanceof Error ? error.message : String(error);
        job.status = cancelled() ? "cancelled" : "failed";
      } finally {
        activeIds.delete(userId);
        await spindle.userStorage.setJson(LAST_PATH, job, { userId });
        send(userId, { type: "qg_job", job });
      }
    })().catch((error) => spindle.log.error(String(error)));
    return job;
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    jobs.set(userId, previous ?? job);
    throw error;
  }
}
spindle.onFrontendMessage(async (payload, userId) => {
  const message = payload;
  if (!userId || !message?.type?.startsWith("qg_") || !message.requestId)
    return;
  try {
    let result;
    switch (message.type) {
      case "qg_bootstrap":
        result = { supported: supported(), settings: await settings(userId), catalog: spindle.permissions.has("image_gen") && supported() ? await catalog(userId) : null, assets: await assets(userId), job: await lastJob(userId) };
        break;
      case "qg_save":
        result = await withSettings(userId, async () => {
          const state = normalizeSettings(message.selection);
          await spindle.userStorage.setJson(STATE_PATH, state, { userId });
          return state;
        });
        break;
      case "qg_start":
        result = await start(userId, message.selection, message.chatId);
        break;
      case "qg_cancel": {
        const job = jobs.get(userId);
        if (!job || job.status !== "running") {
          result = false;
          break;
        }
        job.status = "cancelling";
        send(userId, { type: "qg_job", job });
        const id = activeIds.get(userId);
        result = id ? await spindle.imageGen.cancelNative(id, userId) : true;
        break;
      }
      default:
        return;
    }
    send(userId, { requestId: message.requestId, ok: true, result });
  } catch (error) {
    send(userId, { requestId: message.requestId, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
spindle.on("IMAGE_GEN_PROGRESS", (payload, userId) => {
  const progress = payload;
  const job = userId ? jobs.get(userId) : undefined;
  if (!job || !userId || progress.assetId !== activeIds.get(userId))
    return;
  job.progress = { step: progress.step, totalSteps: progress.totalSteps, nodeId: progress.nodeId };
  send(userId, { type: "qg_job", job });
});
spindle.log.info("QuickGen loaded.");
