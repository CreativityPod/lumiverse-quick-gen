import { expect, test } from 'bun:test'
import { emptyStep, type Job } from '../src/model'

async function harness() {
  const storage = new Map<string, unknown>()
  const messages: any[] = []
  const generated: any[] = []
  const posts: any[] = []
  const edits: any[] = []
  const chatMessages: any[] = [{ id: 'last', content: 'Original message', metadata: { keep: true }, extra: { attachments: [{ id: 'existing' }] } }]
  let allowed = true
  let postingFails = false
  let releaseGeneration: (() => void) | undefined
  let pauseGeneration = false
  let frontend!: (payload: unknown, userId: string) => Promise<void>
  const host = {
    permissions: { has: (permission: string) => permission !== 'chat_mutation' || allowed },
    userStorage: {
      getJson: async (path: string, options: any) => structuredClone(storage.get(`${options.userId}:${path}`) ?? options.fallback),
      setJson: async (path: string, value: unknown, options: any) => { storage.set(`${options.userId}:${path}`, structuredClone(value)) },
    },
    imageGen: {
      getPromptPresets: async () => ({ activeId: 'preset', activeConnectionId: 'conn', presets: [{ id: 'preset', name: 'Main', mode: 'custom' }] }),
      listConnections: async () => [{ id: 'conn', name: 'ComfyUI', provider: 'comfyui', metadata: { comfyui_workflows: [{ id: 'wf', name: 'Workflow', config: {
        workflow_api_json: { '1': { class_type: 'CLIPTextEncode', inputs: { text: '' } } },
        field_mappings: [{ nodeId: '1', fieldName: 'text', mappedAs: 'positive_prompt' }],
      } }] } }],
      cancelNative: async () => true,
      generateNative: async (input: any) => {
        generated.push(input)
        if (pauseGeneration) await new Promise<void>((resolve) => { releaseGeneration = resolve })
        return { generated: true, imageId: `asset-${generated.length}`, mediaUrl: '/asset', mediaType: input.output_media_type, prompt: 'resolved' }
      },
    },
    chat: {
      getMessages: async () => structuredClone(chatMessages),
      updateMessage: async (...args: any[]) => {
        edits.push(args)
        if (postingFails) throw new Error('Chat is unavailable')
        Object.assign(chatMessages.find((message) => message.id === args[1]), args[2])
      },
      appendMessage: async (...args: any[]) => {
      posts.push(args)
      await Bun.sleep(5)
      if (postingFails) throw new Error('Chat is unavailable')
      return { id: `message-${posts.length}` }
    } },
    images: { list: async () => ({ data: [] }) },
    onFrontendMessage: (callback: typeof frontend) => { frontend = callback },
    sendToFrontend: (message: any, userId: string) => messages.push(structuredClone({ ...message, userId })),
    on: () => {}, log: { info: () => {}, error: () => {} },
  }
  async function load() {
    ;(globalThis as any).spindle = host
    await import(`../src/backend.ts?chat-test=${crypto.randomUUID()}`)
  }
  await load()
  async function send(type: string, payload: Record<string, unknown> = {}, userId = 'alice') {
    const requestId = crypto.randomUUID()
    await frontend({ type, requestId, ...payload }, userId)
    return messages.find((message) => message.requestId === requestId)
  }
  async function settle(): Promise<Job> {
    for (let i = 0; i < 200; i++) {
      const job = messages.filter((message) => message.type === 'qg_job').at(-1)?.job as Job | undefined
      if (job && !['running', 'cancelling'].includes(job.status)) return job
      await Bun.sleep(1)
    }
    throw new Error('Job did not settle')
  }
  async function start(kind = 'image', outputTarget = 'preview', chatId = 'original-chat') {
    return send('qg_start', { chatId, selection: { kind, outputTarget, step: { ...emptyStep(kind as 'image' | 'video'), connectionId: 'conn', workflowId: 'wf' } } })
  }
  return { posts, edits, chatMessages, generated, storage, send, start, settle, load,
    allow: (value: boolean) => { allowed = value }, failPosting: (value: boolean) => { postingFails = value },
    pause: () => { pauseGeneration = true }, release: () => releaseGeneration?.(),
  }
}

test('preview-only generation does not mutate chat, even without chat permission', async () => {
  const h = await harness(); h.allow(false)
  await h.start(); const job = await h.settle()
  expect(job.status).toBe('complete'); expect(h.posts).toHaveLength(0)
  const result = await h.send('qg_insert', { jobId: job.id, kind: 'image' })
  expect(result.error).toContain('Chat Mutation'); expect(h.posts).toHaveLength(0)
  const denied = await h.start('image', 'chat_attachment')
  expect(denied.error).toContain('Chat Mutation'); expect(h.generated).toHaveLength(1)
})

test.each(['image', 'video'])('optional automatic %s insertion targets the original chat without starting a reply', async (kind) => {
  const h = await harness()
  await h.start(kind, 'chat_attachment'); const job = await h.settle()
  expect(job.status).toBe('complete'); expect(h.posts).toHaveLength(1)
  expect(h.posts[0][0]).toBe('original-chat')
  expect(h.posts[0][1].role).toBe('assistant')
  expect(h.posts[0][1].content).toContain(kind === 'image' ? '<img ' : '<video ')
  expect(h.posts[0][2]).toBeUndefined()
  expect(job[kind as 'image' | 'video']?.chatMessageId).toBe('message-1')
})

test('manual insertion is scoped, deduplicated, and remembered after reload', async () => {
  const h = await harness()
  await h.start(); const job = await h.settle()
  const payload = { jobId: job.id, kind: 'image', chatId: 'wrong-chat', mediaUrl: 'https://wrong.invalid' }
  expect((await h.send('qg_insert', payload, 'bob')).ok).toBe(false)
  expect((await h.send('qg_insert', { ...payload, jobId: 'stale' })).ok).toBe(false)
  const replies = await Promise.all([h.send('qg_insert', payload), h.send('qg_insert', payload)])
  expect(replies.every((reply) => reply.ok)).toBe(true)
  expect(h.posts).toHaveLength(1); expect(h.posts[0][0]).toBe('original-chat')
  expect(h.posts[0][1].content).toContain('/api/v1/images/asset-1')
  await h.load(); await h.send('qg_insert', payload)
  expect(h.posts).toHaveLength(1)
})

test('failed chat insertion preserves completed generation and can be retried', async () => {
  const h = await harness(); h.failPosting(true)
  await h.start('video', 'chat_attachment'); const job = await h.settle()
  expect(job.status).toBe('complete'); expect(job.video?.imageId).toBe('asset-1')
  expect(job.video?.chatError).toBe('Chat is unavailable')
  h.failPosting(false)
  const retry = await h.send('qg_insert', { jobId: job.id, kind: 'video' })
  expect(retry.result.video.chatMessageId).toBe('message-2')
  expect(retry.result.video.chatError).toBeUndefined(); expect(h.generated).toHaveLength(1)
})

test('an image retained for a later video still inserts into its own original chat', async () => {
  const h = await harness()
  await h.start(); await h.settle()
  await h.start('video', 'preview', 'new-chat'); const job = await h.settle()
  await h.send('qg_insert', { jobId: job.id, kind: 'image' })
  await h.send('qg_insert', { jobId: job.id, kind: 'video' })
  expect(h.posts.map((post) => post[0])).toEqual(['original-chat', 'new-chat'])
})

test.each(['chat_attachment', 'attach_to_message'])('cancelled generation is not automatically posted: %s', async (target) => {
  const h = await harness(); h.pause()
  await h.start('image', target)
  await h.send('qg_cancel'); h.release()
  expect((await h.settle()).status).toBe('cancelled')
  expect(h.posts).toHaveLength(0); expect(h.edits).toHaveLength(0)
})


test.each(['image', 'video'])('attach %s captures the original last message and preserves content and attachments', async (kind) => {
  const h = await harness(); h.pause()
  await h.start(kind, 'attach_to_message')
  h.chatMessages[0].content = 'Edited during generation'
  h.chatMessages.push({ id: 'new-reply', content: 'Later reply' })
  h.release()
  const job = await h.settle()
  expect(job.status).toBe('complete'); expect(h.posts).toHaveLength(0)
  expect(h.edits).toHaveLength(1)
  expect(h.edits[0].slice(0, 2)).toEqual(['original-chat', 'last'])
  expect(Object.keys(h.edits[0][2])).toEqual(['content'])
  expect(h.chatMessages[0].content).toStartWith('Edited during generation\n\n')
  expect(h.chatMessages[0].content).toContain(kind === 'image' ? '<img ' : '<video ')
  expect(h.chatMessages[0].metadata).toEqual({ keep: true })
  expect(h.chatMessages[0].extra.attachments).toEqual([{ id: 'existing' }])
  expect(h.chatMessages[1].content).toBe('Later reply')
  expect(job[kind as 'image' | 'video']?.chatOutputTarget).toBe('attach_to_message')
})

test('attachment preflight rejects empty chat and missing permission before generation', async () => {
  const h = await harness(); h.allow(false)
  expect((await h.start('image', 'attach_to_message')).error).toContain('Chat Mutation')
  h.allow(true); h.chatMessages.length = 0
  expect((await h.start('image', 'attach_to_message')).error).toContain('No message to attach')
  expect(h.generated).toHaveLength(0)
})

test('deleted attachment target keeps media and never falls back to a newer message', async () => {
  const h = await harness(); h.pause()
  await h.start('image', 'attach_to_message')
  h.chatMessages.splice(0, 1, { id: 'other', content: 'Other message' })
  h.release(); const job = await h.settle()
  expect(job.status).toBe('complete')
  expect(job.image?.chatError).toContain('no longer exists')
  expect(h.edits).toHaveLength(0)
  await h.send('qg_insert', { jobId: job.id, kind: 'image', outputTarget: 'attach_to_message' })
  expect(h.edits).toHaveLength(0)
})

test('manual attachment retry retains destination, deduplicates and survives reload', async () => {
  const h = await harness()
  await h.start(); const job = await h.settle()
  h.failPosting(true)
  const payload = { jobId: job.id, kind: 'image', outputTarget: 'attach_to_message', chatId: 'wrong' }
  expect((await h.send('qg_insert', payload)).ok).toBe(false)
  h.chatMessages.push({ id: 'new-reply', content: 'Later reply' })
  h.failPosting(false)
  await Promise.all([h.send('qg_insert', payload), h.send('qg_insert', payload)])
  expect(h.edits).toHaveLength(2)
  expect(h.edits[1].slice(0, 2)).toEqual(['original-chat', 'last'])
  await h.load(); await h.send('qg_insert', payload)
  expect(h.edits).toHaveLength(2)
  expect(h.generated).toHaveLength(1)
})
