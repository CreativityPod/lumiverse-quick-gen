import { expect, test } from 'bun:test'
import { emptyStep } from '../src/model'

async function harness(records: any[] = []) {
  const calls: any[] = []
  const messages: any[] = []
  let frontend!: (payload: unknown, userId: string) => Promise<void>
  let allowed = true
  let source = 'none'
  ;(globalThis as any).spindle = {
    permissions: { has: () => allowed },
    userStorage: { getJson: async () => ({ kind: 'image', step: { ...emptyStep('image'), source }, outputTarget: 'preview' }) },
    imageGen: { getPromptPresets: async () => ({ presets: [] }), cancelNative: async () => true, listConnections: async () => [] },
    images: {
      list: async (options: any) => { calls.push(options); return { data: records.slice(options.offset, options.offset + options.limit), total: records.length } },
      get: async (id: string, options: any) => { calls.push({ id, ...options }); return records.find((record) => record.id === id) ?? null },
    },
    onFrontendMessage: (handler: typeof frontend) => { frontend = handler },
    sendToFrontend: (message: unknown, userId: string) => messages.push({ ...(message as any), userId }),
    on: () => {}, log: { info: () => {} },
  }
  await import(`../src/backend.ts?sources=${crypto.randomUUID()}`)
  return {
    calls,
    setPermission(value: boolean) { allowed = value },
    setSource(value: string) { source = value },
    async send(type: string, payload: Record<string, unknown> = {}) {
      const requestId = crypto.randomUUID()
      await frontend({ type, requestId, ...payload }, 'alice')
      return messages.find((message) => message.requestId === requestId)
    },
  }
}

test('source dropdown finds 100 newest generated still images beyond uploads and videos', async () => {
  const uploads = Array.from({ length: 205 }, (_, i) => ({ id: `upload-${i}`, original_filename: `photo-${i}.png`, mime_type: 'image/png' }))
  const generated = Array.from({ length: 115 }, (_, i) => ({ id: `generated-${i}`, original_filename: `IMAGE-GEN-${i}.png`, mime_type: 'image/png' }))
  const h = await harness([...uploads, { id: 'clip', original_filename: 'image-gen-video.png', mime_type: 'video/mp4' }, ...generated])
  const response = await h.send('qg_bootstrap')
  expect(response.result.assets.map((asset: any) => asset.id)).toEqual(generated.slice(0, 100).map((asset) => asset.id))
  expect(h.calls.map((call) => call.offset)).toEqual([0, 200])
  expect(h.calls.every((call) => call.userId === 'alice' && call.limit === 200)).toBe(true)
})

test('source selection resolves uploads for the authenticated account and restores their label', async () => {
  const image = { id: 'upload', original_filename: 'portrait.png', mime_type: 'image/png', url: '/asset' }
  const h = await harness([image])
  expect((await h.send('qg_source_image', { imageId: 'upload', userId: 'bob' })).result).toEqual(image)
  expect(h.calls[0]).toEqual({ id: 'upload', specificity: 'sm', userId: 'alice' })
  h.setSource('upload')
  const bootstrap = await h.send('qg_bootstrap')
  expect(bootstrap.result.assets).toEqual([])
  expect(bootstrap.result.selectedSource).toEqual(image)
})

test('missing images, videos, and denied permission cannot become a picker source', async () => {
  const h = await harness([{ id: 'video', original_filename: 'image-gen-video.png', mime_type: 'video/mp4' }])
  for (const imageId of ['missing', 'video', null]) expect((await h.send('qg_source_image', { imageId })).ok).toBe(false)
  h.setPermission(false)
  expect((await h.send('qg_source_image', { imageId: 'video' })).error).toContain('Images permission')
  expect((await h.send('qg_bootstrap')).result.assets).toEqual([])
})
