import { expect, test } from 'bun:test'
import { emptyStep } from '../src/model'
test('backend runs one selected workflow and can reuse an image for a later video run', async () => {
  const storage = new Map<string, unknown>()
  const messages: any[] = []
  const calls: any[] = []
  let frontend!: (payload: unknown, userId: string) => Promise<void>
  let failVideo = true
  const config = {
    workflow_api_json: { '1': { class_type: 'CLIPTextEncode', inputs: { text: '' } }, '2': { class_type: 'LoadImage', inputs: { image: '' } } },
    field_mappings: [{ nodeId: '1', fieldName: 'text', mappedAs: 'positive_prompt' }, { nodeId: '2', fieldName: 'image', mappedAs: 'init_image' }],
  }
  ;(globalThis as any).spindle = {
    permissions: { has: () => true },
    userStorage: {
      getJson: async (path: string, options: any) => structuredClone(storage.get(`${options.userId}:${path}`) ?? options.fallback),
      setJson: async (path: string, value: unknown, options: any) => { storage.set(`${options.userId}:${path}`, structuredClone(value)) },
    },
    imageGen: {
      getPromptPresets: async () => ({ activeId: 'preset', activeConnectionId: 'conn', presets: [{ id: 'preset', name: 'Main', mode: 'custom' }] }),
      listConnections: async () => [{ id: 'conn', name: 'ComfyUI', provider: 'comfyui', metadata: { comfyui_workflows: [{ id: 'wf', name: 'Workflow', config }] } }],
      cancelNative: async () => true,
      generateNative: async (input: any) => {
        calls.push(input)
        await Bun.sleep(1)
        if (input.output_media_type === 'video' && failVideo) throw new Error('Video failed')
        return { generated: true, imageId: input.output_media_type === 'video' ? 'video-id' : 'image-id', mediaUrl: '/asset', mediaType: input.output_media_type, prompt: 'resolved' }
      },
    }, images: { list: async () => ({ data: [] }) },
    onFrontendMessage: (callback: typeof frontend) => { frontend = callback },
    sendToFrontend: (message: any, userId: string) => messages.push(structuredClone({ ...message, userId })),
    on: () => {}, log: { info: () => {}, error: () => {} },
  }
  await import('../src/backend')
  const step = { ...emptyStep('image'), connectionId: 'conn', workflowId: 'wf' }
  const imageSelection = { kind: 'image', step }
  await frontend({ type: 'qg_save', requestId: 'save', selection: imageSelection }, 'alice')
  expect(storage.has('alice:selection.json')).toBe(true)
  await frontend({ type: 'qg_start', requestId: 'image', selection: imageSelection, chatId: 'chat' }, 'alice')
  for (let i = 0; i < 50 && messages.at(-1)?.job?.status !== 'complete'; i++) await Bun.sleep(1)
  expect(calls.map((input) => input.output_media_type)).toEqual(['image'])
  const videoSelection = { kind: 'video', step: { ...step, source: 'last' } }
  await frontend({ type: 'qg_start', requestId: 'video', selection: videoSelection, chatId: 'chat' }, 'alice')
  for (let i = 0; i < 50 && messages.at(-1)?.job?.status !== 'failed'; i++) await Bun.sleep(1)
  const failed = messages.filter((message) => message.type === 'qg_job').at(-1).job
  expect(failed.status).toBe('failed')
  expect(failed.image.imageId).toBe('image-id')
  expect(calls.map((input) => input.output_media_type)).toEqual(['image', 'video'])
  expect(calls[1].source_image_id).toBe('image-id')
  expect(calls.every((input) => input.userId === 'alice')).toBe(true)
  failVideo = false
  await frontend({ type: 'qg_start', requestId: 'retry', selection: videoSelection, chatId: 'chat' }, 'alice')
  for (let i = 0; i < 50 && messages.at(-1)?.job?.status !== 'complete'; i++) await Bun.sleep(1)
  expect(calls).toHaveLength(3)
  expect(calls[2].source_image_id).toBe('image-id')
  expect(messages.filter((message) => message.type === 'qg_job').at(-1).job.status).toBe('complete')
  expect(messages.every((message) => message.userId === 'alice')).toBe(true)
})
