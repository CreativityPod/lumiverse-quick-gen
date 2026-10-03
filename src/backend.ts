import type { Host } from './host-types'
import { buildInput, migrateSettings, normalizeSettings, supportsSourceImage, workflows, type Asset, type Catalog, type Job, type LegacySettings, type Result, type Settings } from './model'
declare const spindle: Host

const jobs = new Map<string, Job>()
const locks = new Map<string, Promise<unknown>>()
const activeIds = new Map<string, string>()
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
  if (!supported()) throw new Error('QuickGen needs the included Lumiverse core patch. Apply it and restart Lumiverse.')
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
async function start(userId: string, raw: unknown, chatId: unknown): Promise<Job> {
  if (!spindle.permissions.has('image_gen')) throw new Error('Grant QuickGen the Image Generation permission in Spindle.')
  if (typeof chatId !== 'string' || !chatId) throw new Error('Open a chat before generating.')
  if (jobs.get(userId)?.status === 'running' || jobs.get(userId)?.status === 'cancelling') throw new Error('Wait for the current QuickGen job or cancel it.')
  // Resolve the previous result, then reserve before loading the catalog.
  const selection = normalizeSettings(raw)
  const { kind, step } = selection
  const previous = await lastJob(userId)
  // lastJob may yield, so recheck before acquiring the reservation.
  if (jobs.get(userId)?.status === 'running' || jobs.get(userId)?.status === 'cancelling') throw new Error('QuickGen is already running.')
  const job: Job = { id: crypto.randomUUID(), chatId, recipeName: 'QuickGen', mode: kind, phase: kind, status: 'running', startedAt: Date.now(), image: kind === 'video' ? previous?.image : undefined }
  jobs.set(userId, job)
  const cancelled = () => job.status === 'cancelling'
  try {
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
        const result: Result = { imageId: generated.imageId, mediaUrl: generated.mediaUrl ?? generated.imageUrl!, mediaType: generated.mediaType ?? kind, mimeType: generated.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/png'), prompt: generated.prompt, jobId: generated.jobId }
        job[kind] = result
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
  const message = payload as { type?: string; requestId?: string; selection?: unknown; chatId?: string } | null
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
