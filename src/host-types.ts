import type { ImageGenNativeRequestDTO, ImageGenNativeResultDTO, SpindleAPI } from 'lumiverse-spindle-types'
import type { Catalog } from './model'
export type NativeInput = ImageGenNativeRequestDTO & {
  connection_id?: string; source_image_id?: string; output_media_type?: 'image' | 'video'; output_node_id?: string
}
export type NativeResult = ImageGenNativeResultDTO & { mediaType?: 'image' | 'video'; mediaUrl?: string; mimeType?: string }
export type Host = Omit<SpindleAPI, 'imageGen'> & { imageGen: Omit<SpindleAPI['imageGen'], 'generateNative'> & {
  generateNative(input: NativeInput): Promise<NativeResult>
  getPromptPresets(userId?: string): Promise<Omit<Catalog, 'connections'>>
  cancelNative(jobId: string, userId?: string): Promise<boolean>
} }
