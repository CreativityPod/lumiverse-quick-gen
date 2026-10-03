import type { Host } from './host-types'
import { buildInput, executeSteps, newRecipe, normalizeRecipe, type Asset, type Catalog, type Job, type MediaKind, type Recipe, type Result, type Settings } from './model'
declare const spindle: Host

const jobs = new Map<string, Job>()
const locks = new Map<string, Promise<unknown>>()
const activeIds = new Map<string, string>()
const STATE_PATH = 'quickgen.json'
const LAST_PATH = 'last-job.json'
const supported = () => typeof spindle.imageGen.getPromptPresets === 'function' && typeof spindle.imageGen.cancelNative === 'function'
function send(userId: string, payload: unknown) { spindle.sendToFrontend(payload, userId) }
async function settings(userId: string): Promise<Settings> {
  const stored = await spindle.userStorage.getJson<Settings>(STATE_PATH, { userId, fallback: { recipes: [], selectedId: '' } })
  if (!stored.recipes.length) {
    const recipe = newRecipe('default', 'Image → video')
    return { recipes: [recipe], selectedId: recipe.id }
  }
  return stored
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
async function source(userId: string, recipe: Recipe, kind: MediaKind, previous?: string): Promise<string | undefined> {
  const value = recipe[kind].source
  if (value === 'none') return undefined
  if (value !== 'last') return value
  const image = (await lastJob(userId))?.image?.imageId
  const id = previous ?? image
  if (!id) throw new Error('Generate an image first, or select an existing source image.')
  return id
}
async function start(userId: string, raw: unknown, chatId: unknown, mode: unknown): Promise<Job> {
  if (!spindle.permissions.has('image_gen')) throw new Error('Grant QuickGen the Image Generation permission in Spindle.')
  if (typeof chatId !== 'string' || !chatId) throw new Error('Open a chat before generating.')
  if (!['image', 'video', 'sequence'].includes(String(mode))) throw new Error('Unknown generation mode.')
  if (jobs.get(userId)?.status === 'running' || jobs.get(userId)?.status === 'cancelling') throw new Error('Wait for the current QuickGen job or cancel it.')
  // Resolve the previous result, then reserve before loading the catalog.
  const recipe = normalizeRecipe(raw)
  const previous = await lastJob(userId)
  // lastJob may yield, so recheck before acquiring the reservation.
  if (jobs.get(userId)?.status === 'running' || jobs.get(userId)?.status === 'cancelling') throw new Error('QuickGen is already running.')
  const job: Job = { id: crypto.randomUUID(), chatId, recipeName: recipe.name, mode: mode as Job['mode'], phase: mode === 'video' ? 'video' : 'image', status: 'running', startedAt: Date.now(), image: mode === 'video' ? previous?.image : undefined }
  jobs.set(userId, job)
  try {
    const options = await catalog(userId)
    const selectedSource = recipe[job.phase].source === 'last' ? previous?.image?.imageId : recipe[job.phase].source === 'none' ? undefined : recipe[job.phase].source
    // Validate both steps before spending time on an image that cannot be chained.
    buildInput(recipe[job.phase], job.phase, options, { chatId, jobId: job.id, sourceImageId: selectedSource })
    if (mode === 'sequence') buildInput(recipe.video, 'video', options, { chatId, jobId: job.id, sourceImageId: recipe.video.source === 'none' ? undefined : recipe.video.source === 'last' ? '__previous_image__' : recipe.video.source })
    await spindle.userStorage.setJson(LAST_PATH, job, { userId })
    send(userId, { type: 'qg_job', job })
    void (async () => {
      try {
        await executeSteps(job.mode, async (kind, previousImage) => {
          if (job.status !== 'running') throw new Error('Generation cancelled')
          job.phase = kind
          job.progress = undefined
          const id = `${job.id}:${kind}`
          activeIds.set(userId, id)
          send(userId, { type: 'qg_job', job })
          const sourceImageId = await source(userId, recipe, kind, previousImage ?? selectedSource)
          const input = buildInput(recipe[kind], kind, options, { chatId, jobId: id, sourceImageId })
          if (job.status !== 'running') throw new Error('Generation cancelled')
          const generated = await spindle.imageGen.generateNative({ ...input, userId })
          if (!generated.generated || !generated.imageId) throw new Error(generated.reason || 'The workflow returned no saved output.')
          const result: Result = { imageId: generated.imageId, mediaUrl: generated.mediaUrl ?? generated.imageUrl!, mediaType: generated.mediaType ?? kind, mimeType: generated.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/png'), prompt: generated.prompt, jobId: generated.jobId }
          job[kind] = result
          await spindle.userStorage.setJson(LAST_PATH, job, { userId })
          send(userId, { type: 'qg_job', job })
          return result
        })
        job.status = job.status === 'cancelling' ? 'cancelled' : 'complete'
      } catch (error) {
        job.error = error instanceof Error ? error.message : String(error)
        job.status = job.status === 'cancelling' ? 'cancelled' : 'failed'
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
  const message = payload as { type?: string; requestId?: string; recipe?: unknown; selectedId?: string; deleteId?: string; chatId?: string; mode?: string } | null
  if (!userId || !message?.type?.startsWith('qg_') || !message.requestId) return
  try {
    let result: unknown
    switch (message.type) {
      case 'qg_bootstrap':
        result = { supported: supported(), settings: await settings(userId), catalog: spindle.permissions.has('image_gen') && supported() ? await catalog(userId) : null, assets: await assets(userId), job: await lastJob(userId) }
        break
      case 'qg_save':
        result = await withSettings(userId, async () => {
          const state = await settings(userId)
          if (message.recipe) {
            const recipe = normalizeRecipe(message.recipe)
            state.recipes = [...state.recipes.filter((r) => r.id !== recipe.id), recipe]
            state.selectedId = recipe.id
          }
          if (message.deleteId) state.recipes = state.recipes.filter((r) => r.id !== message.deleteId)
          if (message.selectedId && state.recipes.some((r) => r.id === message.selectedId)) state.selectedId = message.selectedId
          if (!state.recipes.length) state.recipes.push(newRecipe('default', 'Image → video'))
          if (!state.recipes.some((r) => r.id === state.selectedId)) state.selectedId = state.recipes[0]!.id
          await spindle.userStorage.setJson(STATE_PATH, state, { userId })
          return state
        })
        break
      case 'qg_start': result = await start(userId, message.recipe, message.chatId, message.mode); break
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
