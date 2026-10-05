// QuickGen 0.1.5 — generated from src/.

// src/model.ts
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

// src/styles.ts
var styles = `
.qg { --qg-border:var(--lumiverse-border,rgba(160,174,195,.23)); --qg-muted:var(--lumiverse-text-muted,#9aa6b8); color:var(--lumiverse-text,#e8edf5); font:inherit; padding:16px; box-sizing:border-box; max-width:640px; margin:auto; }
.qg * {box-sizing:border-box} .qg h2 {font-size:18px; margin:0 0 6px} .qg p {margin:0 0 16px; color:var(--qg-muted); font-size:12px; line-height:1.6}
.qg-toolbar,.qg-actions {display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:14px} .qg-toolbar select {flex:1; min-width:150px}
.qg button,.qg input,.qg select,.qg textarea {font:inherit; color:inherit; background:var(--lumiverse-bg,rgba(0,0,0,.2)); border:1px solid var(--qg-border); border-radius:8px; padding:10px 12px; font-size:calc(13px * var(--lumiverse-font-scale,1)); min-height:36px}
.qg input:not([type=checkbox]),.qg select,.qg textarea {width:100%; min-width:0} .qg textarea {min-height:72px; resize:vertical; line-height:1.5} .qg input[type=checkbox] {accent-color:var(--lumiverse-primary,#a78bfa); min-height:0}
.qg button {cursor:pointer; font-weight:500; padding:8px 14px; background:transparent; color:var(--qg-muted); white-space:nowrap} .qg button:hover {background:var(--lumiverse-fill-subtle); color:var(--lumiverse-text)} .qg button:disabled {opacity:.5; cursor:default}
.qg button.qg-primary {background:var(--lumiverse-primary,#237d8e); color:var(--lumiverse-primary-contrast,#fff); border-color:var(--lumiverse-primary,#237d8e)} .qg button.qg-primary:hover {background:var(--lumiverse-primary-hover,var(--lumiverse-primary,#237d8e))} .qg button.qg-danger {color:var(--lumiverse-danger,#f6a6a6)}
.qg-step {border:1px solid var(--qg-border); border-radius:10px; padding:14px; background:var(--lumiverse-fill-subtle,rgba(255,255,255,.025))}

.qg label {display:block; font-size:calc(13px * var(--lumiverse-font-scale,1)); margin:0 0 16px} .qg label>span {display:block; margin-bottom:6px; font-weight:500; color:var(--qg-muted)} .qg small {font-size:calc(11px * var(--lumiverse-font-scale,1)); color:var(--lumiverse-text-dim,var(--qg-muted))}
.qg details {border-top:1px solid var(--qg-border); padding-top:12px; margin-top:12px} .qg summary {font-size:12px; cursor:pointer; margin-bottom:12px} .qg .qg-check {display:flex; gap:8px; align-items:center}
.qg-status {border:1px solid var(--qg-border); border-radius:10px; padding:12px; margin-top:12px; font-size:12px; line-height:1.6} .qg-status[role=alert] {color:#f6a6a6; border-color:rgba(230,110,110,.4)}
.qg progress {width:100%; height:6px; accent-color:var(--lumiverse-primary,#a78bfa); margin-top:8px} .qg-results {display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-top:14px}
.qg-results figure {margin:0; overflow:hidden; border:1px solid var(--qg-border); border-radius:10px} .qg-results img,.qg-results video {width:100%; max-height:360px; object-fit:contain; display:block; background:rgba(0,0,0,.2)} .qg-results figcaption {padding:10px; font-size:12px}
.qg-result-actions {display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:6px} .qg label>small {display:block; margin-top:5px; line-height:1.5}
.qg-post-actions {display:flex; flex-wrap:wrap; gap:8px} .qg-result-posted {color:var(--qg-muted)} .qg p.qg-media-unavailable {padding:16px; margin:0; text-align:center}
.qg a {color:var(--lumiverse-primary,#a78bfa)} .qg footer {margin-top:16px; color:var(--qg-muted); font-size:11px} .qg .qg-saved {color:var(--qg-muted); font-size:11px}
/* Match ImgGen's FormComponents fields using the shared live theme tokens. */
.qg input,.qg textarea {transition:border-color var(--lumiverse-transition-fast,.15s),box-shadow var(--lumiverse-transition-fast,.15s)}
.qg input:focus,.qg textarea:focus {border-color:var(--lumiverse-primary-muted,#a78bfa); box-shadow:0 0 0 3px var(--lumiverse-primary-010,rgba(167,139,250,.1)); outline:none}
.qg select {padding-right:32px; appearance:none; cursor:pointer; transition:border-color var(--lumiverse-transition-fast,.15s)}
.qg select:focus {border-color:var(--lumiverse-primary-muted,#a78bfa); outline:none}
.qg .qg-select {position:relative; margin:0; color:inherit; font-weight:400}
.qg .qg-select::after {content:''; position:absolute; right:14px; top:50%; width:7px; height:7px; border-right:1.5px solid var(--qg-muted); border-bottom:1.5px solid var(--qg-muted); transform:translateY(-70%) rotate(45deg); pointer-events:none}
.qg input:disabled,.qg select:disabled,.qg textarea:disabled {opacity:.5; cursor:not-allowed}
@media(max-width:700px) {.qg{padding:12px}}
`;

// src/frontend.ts
var clone = (value) => JSON.parse(JSON.stringify(value));
var uid = () => `qg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
function setup(ctx) {
  const tab = ctx.ui.registerDrawerTab({ id: "quickgen", title: "QuickGen", shortName: "QuickGen", description: "Run a saved ComfyUI workflow", keywords: ["image", "video", "comfyui", "workflow", "preset"], iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z"/></svg>' });
  const action = ctx.ui.registerInputBarAction({ id: "quickgen", label: "QuickGen", subtitle: "Run a saved workflow" });
  const offAction = action.onClick(() => tab.activate());
  const removeStyle = ctx.dom.addStyle(styles);
  const root = document.createElement("section");
  root.className = "qg";
  tab.root.append(root);
  let state = null;
  let draft = null;
  let statusRoot;
  let savedLabel;
  let error = "";
  let disposed = false;
  let starting = false;
  const inserting = new Set;
  const unavailableMedia = new Set;
  let saveTimer;
  const pending = new Map;
  function request(type, payload = {}) {
    const requestId = uid();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("QuickGen did not respond. Check that its backend is enabled."));
      }, 30000);
      pending.set(requestId, { resolve: (value) => resolve(value), reject, timer });
      ctx.sendToBackend({ type, requestId, ...payload });
    });
  }
  const offBackend = ctx.onBackendMessage((payload) => {
    const message = payload;
    if (message.requestId) {
      const callback = pending.get(message.requestId);
      if (callback) {
        clearTimeout(callback.timer);
        pending.delete(message.requestId);
        if (message.ok)
          callback.resolve(message.result);
        else
          callback.reject(new Error(message.error || "QuickGen failed."));
      }
    }
    if (message.type === "qg_job" && message.job && state) {
      state.job = message.job;
      renderStatus();
    }
  });
  const el = (tag, text = "", className = "") => {
    const node = document.createElement(tag);
    if (text)
      node.textContent = text;
    if (className)
      node.className = className;
    return node;
  };
  function button(text, run, className = "") {
    const node = el("button", text, className);
    node.type = "button";
    node.onclick = () => {
      Promise.resolve().then(run).catch(showError);
    };
    return node;
  }
  function showError(reason) {
    error = reason instanceof Error ? reason.message : String(reason);
    renderStatus();
  }
  function control(label, node) {
    const wrapper = el("label");
    wrapper.append(el("span", label), node);
    return wrapper;
  }
  function select(items, value, changed) {
    const node = el("select");
    for (const item of items) {
      const option = el("option", item.label);
      option.value = item.value;
      node.append(option);
    }
    if (value && !items.some((item) => item.value === value)) {
      const missing = el("option", `Unavailable selection (${value})`);
      missing.value = value;
      node.append(missing);
    }
    node.value = value;
    node.onchange = () => changed(node.value);
    const wrapper = el("span", "", "qg-select");
    wrapper.append(node);
    return wrapper;
  }
  function defaultSelection(step) {
    if (!state?.catalog)
      return;
    if (!step.connectionId)
      step.connectionId = state.catalog.connections.find((c) => c.id === state.catalog.activeConnectionId)?.id || state.catalog.connections[0]?.id || "";
    const connection = state.catalog.connections.find((c) => c.id === step.connectionId);
    if (!step.workflowId)
      step.workflowId = String(connection?.metadata.comfyui_active_workflow_id || workflows(connection)[0]?.id || "");
  }
  async function save() {
    if (!draft || !state)
      return;
    clearTimeout(saveTimer);
    state.settings = await request("qg_save", { selection: clone(draft) });
    if (savedLabel)
      savedLabel.textContent = "Saved";
  }
  function changed() {
    if (savedLabel)
      savedLabel.textContent = "Saving…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      save().catch(showError);
    }, 600);
  }
  function renderStep() {
    const { kind, step } = draft;
    defaultSelection(step);
    const connection = state.catalog?.connections.find((c) => c.id === step.connectionId);
    const list = workflows(connection);
    const workflow = list.find((w) => w.id === step.workflowId);
    const acceptsSource = supportsSourceImage(workflow);
    if (!acceptsSource)
      step.source = "none";
    const panel = el("section", "", "qg-step");
    const connections = state.catalog?.connections ?? [];
    panel.append(control("ComfyUI connection", select([{ value: "", label: "Choose a connection" }, ...connections.map((c) => ({ value: c.id, label: c.name }))], step.connectionId, (value) => {
      step.connectionId = value;
      step.workflowId = "";
      step.fields = {};
      step.outputNodeId = "";
      defaultSelection(step);
      changed();
      render();
    })));
    panel.append(control("Workflow", select([{ value: "", label: "Choose a saved workflow" }, ...list.map((w) => ({ value: w.id, label: w.name }))], step.workflowId, (value) => {
      step.workflowId = value;
      step.fields = {};
      step.outputNodeId = "";
      changed();
      render();
    })));
    panel.append(control("Main Preset", select([{ value: "", label: "Use active Main Preset" }, ...(state.catalog?.presets ?? []).map((p) => ({ value: p.id, label: p.name }))], step.presetId, (value) => {
      step.presetId = value;
      changed();
    })));
    panel.append(control("Media type", select([{ value: "image", label: "Image" }, { value: "video", label: "Video" }], kind, (value) => {
      draft.kind = value;
      changed();
      render();
    })));
    const output = control("Output", select([
      { value: "chat_attachment", label: "Insert into chat" },
      { value: "attach_to_message", label: "Attach to last message" },
      { value: "preview", label: "Preview only" }
    ], draft.outputTarget ?? "preview", (value) => {
      draft.outputTarget = value;
      changed();
      render();
    }));
    output.append(el("small", draft.outputTarget === "chat_attachment" ? "Insert the generated image or video into the chat where this run starts." : draft.outputTarget === "attach_to_message" ? "Attach to the last message in this chat when generation starts." : kind === "image" ? "Preview the image here. You can insert or attach it afterward." : "Preview the video here."));
    panel.append(output);
    if (acceptsSource) {
      const sourceItems = [{ value: "none", label: "Use workflow image fields / no override" }, { value: "last", label: "Previous QuickGen image" }, ...state.assets.map((asset) => ({ value: asset.id, label: asset.original_filename || asset.id }))];
      panel.append(control("Source image override", select(sourceItems, step.source, (value) => {
        step.source = value;
        changed();
        render();
      })));
      if (step.source !== "none")
        panel.append(el("small", "The source image override replaces the workflow’s Load Image value."));
    }
    const controls = fieldControls(workflow).filter((field) => step.bypassLoras || !field.semantic.startsWith("lora_"));
    const fields = el("details");
    fields.open = true;
    fields.append(el("summary", `Workflow fields · ${controls.length}`));
    if (!controls.length)
      fields.append(el("small", "Map CUSTOM FIELDS in ImgGen when importing the workflow to expose more controls here."));
    for (const field of controls) {
      const value = Object.hasOwn(step.fields, field.key) ? step.fields[field.key] : field.value;
      const update = (value) => {
        step.fields[field.key] = value;
        changed();
      };
      let node;
      if (field.options.length) {
        node = select(field.options.map((value) => ({ value, label: value })), String(value), (value) => update(typeof field.value === "number" ? Number(value) : typeof field.value === "boolean" ? value === "true" : value));
      } else if (typeof field.value === "boolean") {
        const input = el("input");
        input.type = "checkbox";
        input.checked = Boolean(value);
        input.onchange = () => update(input.checked);
        node = input;
      } else {
        const input = el("input");
        input.type = typeof field.value === "number" ? "number" : "text";
        input.step = "any";
        input.value = String(value);
        input.onchange = () => update(typeof field.value === "number" ? Number(input.value) : input.value);
        node = input;
      }
      if (field.semantic === "init_image" && step.source !== "none")
        (node.querySelector("select") ?? node).disabled = true;
      fields.append(control(field.label, node));
    }
    panel.append(fields);
    const advanced = el("details");
    advanced.append(el("summary", "Prompt and run options"));
    for (const [key, label] of [["prompt", "Prompt override · optional"], ["negativePrompt", "Negative prompt override · optional"]]) {
      const input = el("textarea");
      input.value = step[key];
      input.onchange = () => {
        step[key] = input.value;
        changed();
      };
      advanced.append(control(label, input));
    }
    const nodes = Object.entries(workflow?.config.workflow_api_json ?? {}).filter(([, node]) => /save|combine|preview|output/i.test(node.class_type));
    advanced.append(control("Final output node", select([{ value: "", label: `Auto · saved ${kind} output` }, ...nodes.map(([id, node]) => ({ value: id, label: `${node._meta?.title || node.class_type} (${id})` }))], step.outputNodeId, (value) => {
      step.outputNodeId = value;
      changed();
    })));
    const timeout = el("input");
    timeout.type = "number";
    timeout.min = "15";
    timeout.max = "3600";
    timeout.value = String(step.timeoutSeconds);
    timeout.onchange = () => {
      step.timeoutSeconds = Number(timeout.value);
      changed();
    };
    advanced.append(control("Generation timeout · seconds", timeout));
    const bypass = el("input");
    bypass.type = "checkbox";
    bypass.checked = step.bypassLoras;
    bypass.onchange = () => {
      step.bypassLoras = bypass.checked;
      changed();
      render();
    };
    const bypassLabel = control("Skip ImgGen character and active preset LoRAs for this step", bypass);
    bypassLabel.className = "qg-check";
    advanced.append(bypassLabel);
    panel.append(advanced);
    return panel;
  }
  async function generate() {
    if (!draft || !state)
      return;
    starting = true;
    error = "";
    renderStatus();
    try {
      if (draft.outputTarget && draft.outputTarget !== "preview")
        await ensureChatPermission();
      await save();
      state.job = await request("qg_start", { selection: clone(draft), chatId: ctx.getActiveChat().chatId });
    } finally {
      starting = false;
      renderStatus();
    }
  }
  async function ensureChatPermission() {
    if ((await ctx.permissions.getGranted()).includes("chat_mutation"))
      return;
    const granted = await ctx.permissions.request(["chat_mutation"]);
    if (!granted.includes("chat_mutation"))
      throw new Error("Grant QuickGen the Chat Mutation permission or choose Preview only.");
  }
  async function insertIntoChat(job, kind, outputTarget = "chat_attachment") {
    const key = `${job.id}:${kind}`;
    if (inserting.has(key))
      return;
    inserting.add(key);
    error = "";
    renderStatus();
    try {
      await ensureChatPermission();
      const updated = await request("qg_insert", { jobId: job.id, kind, outputTarget });
      if (state?.job?.id === updated.id)
        state.job = updated;
    } finally {
      inserting.delete(key);
      renderStatus();
    }
  }
  function renderStatus() {
    if (!statusRoot || disposed)
      return;
    statusRoot.replaceChildren();
    const job = state?.job;
    const busy = starting || job?.status === "running" || job?.status === "cancelling";
    tab.setBadge(busy ? "…" : null);
    const actions = el("div", "", "qg-actions");
    const generateButton = button(`Generate ${draft?.kind ?? "video"}`, generate, "qg-primary");
    generateButton.disabled = busy || inserting.size > 0 || !state?.supported || !state.catalog?.connections.length;
    actions.append(generateButton);
    if (busy && !starting)
      actions.append(button("Cancel", async () => {
        await request("qg_cancel");
      }, "qg-danger"));
    statusRoot.append(actions);
    const text = error || job?.error || (job ? `${job.recipeName} · ${job.status === "running" ? `Generating ${job.phase}` : job.status}` : "Choose a workflow and Main Preset, then generate.");
    const status = el("div", text, "qg-status");
    status.setAttribute("role", error || job?.error ? "alert" : "status");
    status.setAttribute("aria-live", "polite");
    if (busy && job?.progress) {
      const { step, totalSteps, nodeId } = job.progress;
      if (nodeId)
        status.append(el("div", `Node ${nodeId}${totalSteps ? ` · ${step || 0}/${totalSteps}` : ""}`));
      const progress = el("progress");
      if (totalSteps) {
        progress.max = totalSteps;
        progress.value = step || 0;
      }
      status.append(progress);
    }
    statusRoot.append(status);
    if (job?.chatId && job.chatId !== ctx.getActiveChat().chatId)
      statusRoot.append(el("p", "These results belong to the chat where the job was started."));
    const results = el("div", "", "qg-results");
    for (const kind of ["image", "video"]) {
      const result = job?.[kind];
      if (!result)
        continue;
      const figure = el("figure");
      const caption = el("figcaption");
      const link = el("a", `Open ${kind}`);
      link.href = result.mediaUrl;
      link.target = "_blank";
      link.rel = "noopener";
      const resultActions = el("div", "", "qg-result-actions");
      const postingActions = el("div", "", "qg-post-actions");
      resultActions.append(link);
      if (result.chatMessageId) {
        resultActions.append(el("span", result.chatOutputTarget === "attach_to_message" ? "Attached to message" : "Inserted into chat", "qg-result-posted"));
      } else if (kind === "image" && result.mediaType === "image") {
        if (inserting.has(`${job.id}:${kind}`)) {
          const posting = el("span", "Posting…", "qg-result-posting");
          posting.setAttribute("role", "status");
          postingActions.append(posting);
        } else {
          const insert = button("Insert into chat", () => insertIntoChat(job, kind));
          insert.disabled = inserting.size > 0 || busy;
          const attach = button("Attach to last message", () => insertIntoChat(job, kind, "attach_to_message"));
          attach.disabled = inserting.size > 0 || busy;
          postingActions.append(insert, attach);
        }
        resultActions.append(postingActions);
      }
      caption.append(resultActions);
      const destination = el("small", "Inserts into the original chat.");
      if (!result.chatMessageId && kind === "image" && result.mediaType === "image" && (result.chatId ?? job.chatId) !== ctx.getActiveChat().chatId)
        caption.append(destination);
      if (result.chatError) {
        const warning = el("p", `Generated successfully, but could not post to chat: ${result.chatError}`);
        warning.setAttribute("role", "alert");
        caption.append(warning);
      }
      const prompt = el("details");
      prompt.append(el("summary", "Resolved prompt"), el("p", result.prompt));
      caption.append(prompt);
      const unavailable = () => {
        link.remove();
        postingActions.remove();
        destination.remove();
        return el("p", `${kind === "image" ? "Image" : "Video"} unavailable.`, "qg-media-unavailable");
      };
      if (!result.mediaUrl || unavailableMedia.has(result.mediaUrl)) {
        figure.append(unavailable());
      } else {
        const media = result.mediaType === "video" ? el("video") : el("img");
        media.onerror = () => {
          if (disposed || !figure.isConnected)
            return;
          unavailableMedia.add(result.mediaUrl);
          media.replaceWith(unavailable());
        };
        if (media instanceof HTMLVideoElement) {
          media.controls = true;
          media.preload = "metadata";
          media.playsInline = true;
        } else
          media.alt = `QuickGen ${kind} result`;
        media.src = result.mediaUrl;
        figure.append(media);
      }
      figure.append(caption);
      results.append(figure);
    }
    statusRoot.append(results);
  }
  function render() {
    if (disposed)
      return;
    root.replaceChildren();
    root.append(el("h2", "QuickGen"), el("p", "Choose an existing ComfyUI workflow, Main Preset, and field values. Generate one image or video at a time."));
    if (!state || !draft) {
      root.append(el("p", error || "Loading QuickGen…"));
      return;
    }
    if (!state.supported)
      root.append(el("p", "QuickGen requires Lumiverse v1.2.4 or newer with the QuickGen APIs. Use a build containing those changes and restart Lumiverse."));
    else if (!state.catalog)
      root.append(button("Grant generation permissions", async () => {
        await ctx.permissions.request(["image_gen", "images"]);
        await refresh();
      }));
    const toolbar = el("div", "", "qg-toolbar");
    toolbar.append(button("Refresh", async () => {
      await save();
      await refresh();
    }));
    savedLabel = el("span", "Selection remembered", "qg-saved");
    toolbar.append(savedLabel);
    root.append(toolbar, renderStep());
    statusRoot = el("div");
    root.append(statusRoot);
    renderStatus();
    root.append(el("footer", "Your last selection is remembered in QuickGen. “Use active” is captured when a run starts. ImgGen’s active selections stay unchanged."));
  }
  async function refresh() {
    error = "";
    const next = await request("qg_bootstrap");
    if (disposed)
      return;
    state = next;
    unavailableMedia.clear();
    draft = clone(state.settings);
    render();
  }
  const offChat = ctx.events.on("CHAT_SWITCHED", () => renderStatus());
  const offConnections = ctx.events.on("IMAGE_GEN_CONNECTION_CHANGED", () => {
    if (savedLabel)
      savedLabel.textContent = "Connections changed · click Refresh";
  });
  render();
  refresh().catch((reason) => {
    error = reason instanceof Error ? reason.message : String(reason);
    render();
  });
  return () => {
    disposed = true;
    clearTimeout(saveTimer);
    for (const callback of pending.values()) {
      clearTimeout(callback.timer);
      callback.reject(new Error("QuickGen panel closed."));
    }
    pending.clear();
    offBackend();
    offChat();
    offConnections();
    offAction();
    action.destroy();
    tab.destroy();
    removeStyle();
  };
}
export {
  setup
};
