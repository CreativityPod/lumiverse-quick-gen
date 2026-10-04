import type { Host } from './host-types'
import { buildInput, chatContent, migrateSettings, normalizeSettings, supportsSourceImage, workflows, type Asset, type Catalog, type Job, type LegacySettings, type MediaKind, type OutputTarget, type Result, type Settings } from './model'
declare const spindle: Host

const jobs = new Map<string, Job>()
const locks = new Map<string, Promise<unknown>>()
const activeIds = new Map<string, string>()
const insertions = new Map<string, Promise<{ id: string; target: Exclude<OutputTarget, 'preview'> }>>()
const STATE_PATH = 'selection.json'
const LAST_PATH = 'last-job.json'
const supported = () => typeof spindle.imageGen.getPromptPresets === 'function' && typeof spindle.imageGen.cancelNative === 'function'
function send(userId: string, payload: unknown) { spindle.sendToFrontend(payload, userId) }
async function settings(userId: string): Promise<Settings> {
  const stored = await spindle.userStorage.getJson<Settings | null>(STATE_PATH, { userId, fallback: null })
  if (stored) return normalizeSettings(stored)
  const legacy = await spindle.userStorage.getJson<LegacySettings | null>('quickgen.json', { userId, fallback: null })
  return migrateSettings(legacy)
}
function withSettings<T>(userId: string, work: () => Promise<T>): Promise<T> {
  const pending = (locks.get(userId) ?? Promise.resolve()).catch(() => {}).then(work)
  locks.set(userId, pending)
  return pending.finally(() => { if (locks.get(userId) === pending) locks.delete(userId) })
}
async function catalog(userId: string): Promise<Catalog> {
  if (!supported()) throw new Error('QuickGen requires Lumiverse v1.2.4 or newer with the QuickGen APIs. Use a build containing those changes and restart Lumiverse.')
  const [presets, connections] = await Promise.all([
    spindle.imageGen.getPromptPresets(userId), spindle.imageGen.listConnections(userId),
  ])
  return { ...presets, connections: connections.filter((c) => c.provider === 'comfyui') }
}
async function assets(userId: string): Promise<Asset[]> {
  if (!spindle.permissions.has('images')) return []
  const list = await spindle.images.list({ limit: 100, userId })
  return list.data.filter((asset) => asset.mime_type.startsWith('image/'))
}
async function lastJob(userId: string): Promise<Job | null> {
  if (jobs.has(userId)) return jobs.get(userId)!
  const stored = await spindle.userStorage.getJson<Job | null>(LAST_PATH, { userId, fallback: null })
  if (stored?.status === 'running' || stored?.status === 'cancelling') {
    return { ...stored, status: 'failed', error: 'QuickGen restarted before completion. Check ComfyUI before retrying; completed assets remain in Lumiverse.' }
  }
  return stored
}
async function insertResult(userId: string, job: Job, kind: MediaKind, target: Exclude<OutputTarget, 'preview'> = 'chat_attachment'): Promise<void> {
  if (!spindle.permissions.has('chat_mutation')) throw new Error('Grant QuickGen the Chat Mutation permission to insert into chat.')
  const result = job[kind]
  if (!result?.imageId) throw new Error('No saved result is available to insert.')
  if (result.chatMessageId) return
  const key = `${userId}:${result.imageId}`
  if ([...insertions.keys()].some((entry) => entry.startsWith(`${userId}:`) && entry !== key)) throw new Error('Wait for the current chat output to finish.')
  let pending = insertions.get(key)
  if (!pending) {
    pending = (async () => {
      const chatId = result.chatId ?? job.chatId
      const content = chatContent(result)
      if (target === 'attach_to_message') {
        const messages = await spindle.chat.getMessages(chatId)
        // Automatic output captures the target before generation; manual output
        // captures it once on first attempt, and retries keep that same target.
        const message = result.attachToMessageId
          ? messages.find((entry) => entry.id === result.attachToMessageId)
          : messages.at(-1)
        if (!message) throw new Error(result.attachToMessageId ? 'The target message no longer exists.' : 'No message to attach to. Send a message first.')
        result.attachToMessageId = message.id
        // Patch only content so existing metadata and attachments remain intact.
        if (!message.content.includes(content)) {
          await spindle.chat.updateMessage(chatId, message.id, { content: `${message.content}${message.content ? '\n\n' : ''}${content}` })
        }
        return { id: message.id, target }
      }
      return { ...await spindle.chat.appendMessage(chatId, {
        role: 'assistant', content,
        metadata: { quickGen: { jobId: job.id, imageId: result.imageId, mediaType: result.mediaType } },
      }), target }
    })()
    insertions.set(key, pending)
  }
  try {
    const posted = await pending
    result.chatMessageId = posted.id
    result.chatOutputTarget = posted.target
    delete result.chatError
  } catch (error) {
    result.chatError = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    if (insertions.get(key) === pending) insertions.delete(key)
  }
}
async function start(userId: string, raw: unknown, chatId: unknown): Promise<Job> {
  if (!spindle.permissions.has('image_gen')) throw new Error('Grant QuickGen the Image Generation permission in Spindle.')
  if (typeof chatId !== 'string' || !chatId) throw new Error('Open a chat before generating.')
  if (jobs.get(userId)?.status === 'running' || jobs.get(userId)?.status === 'cancelling') throw new Error('Wait for the current QuickGen job or cancel it.')
  // Resolve the previous result, then reserve before loading the catalog.
  const selection = normalizeSettings(raw)
  if (selection.outputTarget !== 'preview' && !spindle.permissions.has('chat_mutation')) throw new Error('Grant QuickGen the Chat Mutation permission or choose Preview Only.')
  const { kind, step } = selection
  const previous = await lastJob(userId)
  if ([...insertions.keys()].some((entry) => entry.startsWith(`${userId}:`))) throw new Error('Wait for the current chat output to finish.')
  // lastJob may yield, so recheck before acquiring the reservation.
  if (jobs.get(userId)?.status === 'running' || jobs.get(userId)?.status === 'cancelling') throw new Error('QuickGen is already running.')
  const previousImage = previous?.image ? { ...previous.image, chatId: previous.image.chatId ?? previous.chatId } : undefined
  const job: Job = { id: crypto.randomUUID(), chatId, recipeName: 'QuickGen', mode: kind, phase: kind, status: 'running', startedAt: Date.now(), image: kind === 'video' ? previousImage : undefined }
  jobs.set(userId, job)
  const cancelled = () => job.status === 'cancelling'
  try {
    if (selection.outputTarget === 'attach_to_message') {
      const messages = await spindle.chat.getMessages(chatId)
      const last = messages.at(-1)
      if (!last) throw new Error('No message to attach to. Send a message first.')
      job.attachToMessageId = last.id
    }
    const options = await catalog(userId)
    const connection = options.connections.find((entry) => entry.id === step.connectionId)
    const workflow = workflows(connection).find((entry) => entry.id === step.workflowId)
    const selectedSource = !supportsSourceImage(workflow) ? undefined : step.source === 'last' ? previous?.image?.imageId : step.source === 'none' ? undefined : step.source
    const input = buildInput(step, kind, options, { chatId, jobId: `${job.id}:${kind}`, sourceImageId: selectedSource })
    job.recipeName = connection?.name ?? 'QuickGen'
    await spindle.userStorage.setJson(LAST_PATH, job, { userId })
    send(userId, { type: 'qg_job', job })
    void (async () => {
      try {
        if (job.status !== 'running') throw new Error('Generation cancelled')
        activeIds.set(userId, input.clientJobId)
        const generated = await spindle.imageGen.generateNative({ ...input, userId })
        if (!generated.generated || !generated.imageId) throw new Error(generated.reason || 'The workflow returned no saved output.')
        const result: Result = { imageId: generated.imageId, mediaUrl: generated.mediaUrl ?? generated.imageUrl!, mediaType: generated.mediaType ?? kind, mimeType: generated.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/png'), prompt: generated.prompt, jobId: generated.jobId, chatId, attachToMessageId: job.attachToMessageId }
        job[kind] = result
        if (!cancelled() && selection.outputTarget !== 'preview') {
          // A posting failure must not discard a successfully generated asset.
          try { await insertResult(userId, job, kind, selection.outputTarget) }
          catch (error) { result.chatError = error instanceof Error ? error.message : String(error) }
        }
        job.status = cancelled() ? 'cancelled' : 'complete'
      } catch (error) {
        job.error = error instanceof Error ? error.message : String(error)
        job.status = cancelled() ? 'cancelled' : 'failed'
      } finally {
        activeIds.delete(userId)
        await spindle.userStorage.setJson(LAST_PATH, job, { userId })
        send(userId, { type: 'qg_job', job })
      }
    })().catch((error) => spindle.log.error(String(error)))
    return job
  } catch (error) {
    job.status = 'failed'
    job.error = error instanceof Error ? error.message : String(error)
    jobs.set(userId, previous ?? job)
    throw error
  }
}

spindle.onFrontendMessage(async (payload, userId) => {
  const message = payload as { type?: string; requestId?: string; selection?: unknown; chatId?: string; jobId?: string; kind?: MediaKind; outputTarget?: unknown } | null
  if (!userId || !message?.type?.startsWith('qg_') || !message.requestId) return
  try {
    let result: unknown
    switch (message.type) {
      case 'qg_bootstrap':
        result = { supported: supported(), settings: await settings(userId), catalog: spindle.permissions.has('image_gen') && supported() ? await catalog(userId) : null, assets: await assets(userId), job: await lastJob(userId) }
        break
      case 'qg_save':
        result = await withSettings(userId, async () => {
          const state = normalizeSettings(message.selection)
          await spindle.userStorage.setJson(STATE_PATH, state, { userId })
          return state
        })
        break
      case 'qg_start': result = await start(userId, message.selection, message.chatId); break
      case 'qg_insert': {
        const job = await lastJob(userId)
        if (!job || job.id !== message.jobId) throw new Error('This result is no longer current. Refresh QuickGen.')
        if (message.kind !== 'image' && message.kind !== 'video') throw new Error('Choose an image or video result.')
        if (job.status === 'running' || job.status === 'cancelling') throw new Error('Wait for this generation to finish before inserting.')
        const target = message.outputTarget ?? 'chat_attachment'
        if (target !== 'chat_attachment' && target !== 'attach_to_message') throw new Error('Choose a valid chat output.')
        jobs.set(userId, job)
        try { await insertResult(userId, job, message.kind, target) }
        finally {
          // A newer run may have started while chat insertion was in flight.
          if (jobs.get(userId)?.id === job.id) {
            await spindle.userStorage.setJson(LAST_PATH, job, { userId })
            send(userId, { type: 'qg_job', job })
          }
        }
        result = job
        break
      }
      case 'qg_cancel': {
        const job = jobs.get(userId)
        if (!job || job.status !== 'running') { result = false; break }
        job.status = 'cancelling'
        send(userId, { type: 'qg_job', job })
        const id = activeIds.get(userId)
        result = id ? await spindle.imageGen.cancelNative(id, userId) : true
        break
      }
      default: return
    }
    send(userId, { requestId: message.requestId, ok: true, result })
  } catch (error) {
    send(userId, { requestId: message.requestId, ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})
spindle.on('IMAGE_GEN_PROGRESS', (payload, userId) => {
  const progress = payload as { assetId?: string; step?: number; totalSteps?: number; nodeId?: string }
  const job = userId ? jobs.get(userId) : undefined
  if (!job || !userId || progress.assetId !== activeIds.get(userId)) return
  job.progress = { step: progress.step, totalSteps: progress.totalSteps, nodeId: progress.nodeId }
  send(userId, { type: 'qg_job', job })
})
spindle.log.info('QuickGen loaded.')
