# Lumiverse QuickGen

A separate Spindle extension with a drawer panel and an input-bar shortcut. Each recipe stores an image step and a video step with independent ComfyUI connections, saved workflows, ImgGen Main Presets, and mapped CUSTOM FIELDS.

## Use

1. Import **API-format** workflows in Lumiverse's Image Gen Connections settings. Map a `positive_prompt` field in each workflow. Map `init_image` in a workflow that should receive an image. Mark additional controls as CUSTOM FIELDS and configure their choices in ImgGen.
2. Open QuickGen from the drawer or the input bar's Extras menu.
3. Select a connection, workflow, and Main Preset for each step. Open **Workflow fields** to choose values. Numeric, boolean, text, and stored dropdown choices retain their types.
4. Click **Generate image**, **Generate video**, or **Run sequence**. A sequence waits for the image to be saved before starting the video. Set the video source to **Previous QuickGen image** to pass that image into the video workflow. Choose **None** for independent text-to-video generation.
5. Review the image/video in QuickGen. If video fails, click **Generate video** to retry using the already saved image. Existing still images from Lumiverse's asset store can also be selected as inputs.

Changes are saved automatically to QuickGen's per-user storage. New, Duplicate, and Delete manage recipes. “Use active Main Preset” captures its ID at the start of the job. A selected preset is used for that request without activating it in ImgGen. Prompt overrides are optional; with a parsed preset, they still go through its parser. Video steps skip native image LoRAs by default; change that option if the workflow is designed to use them.

## Install locally

This extension requires the accompanying core patch. Lumiverse 1.2.4 by itself does not include these APIs. This checkout already has the patch applied; `lumiverse-core.patch` is included for another matching checkout.

1. Update/restart Lumiverse with the patch. If applying elsewhere, run `git apply --check /path/to/lumiverse-quick-gen/lumiverse-core.patch` before applying it.
2. Copy this extension's folder to `<Lumiverse data directory>/extensions/quick_gen`. Include `spindle.json` and `dist/`; `node_modules` is not needed to run the built bundles.
3. Use **Import local extensions** in Spindle. Lumiverse normalizes the copied folder into its managed `repo` layout. Enable QuickGen and grant its **Image Generation** and **Images** permissions.

The manifest's GitHub URL is the intended repository metadata; this work does not publish a repository. Use local import until the repository is published.

## Build and test

```sh
bun install
bun run check
```

The shipped `dist/backend.js` and `dist/frontend.js` are self-contained. No MCP server, additional runtime service, or chat commands are required. Recipes and jobs run in the extension backend using the native Spindle generation API.

## Minimum core changes

- `spindle.imageGen.getPromptPresets(userId?)`: read Main Presets and active preset/connection IDs, gated by `image_gen` and account scope.
- `generateNative()` request-local `connection_id`, `source_image_id`, `output_media_type`, and `output_node_id` options. Source bytes are loaded on the host; large image/video data URLs stay out of extension messages with `includeDataUrl: false`.
- Preset mode/parser selection follows an explicitly selected preset; invalid preset/workflow IDs fail instead of silently falling back.
- Request-local `comfyui_field_values.node_fields` preserves independent values for mapped sampler/model controls on different nodes. CUSTOM FIELDS retain their existing per-node API. Native LoRA fields are used unless that step opts to skip them.
- ComfyUI final-output collection recognizes native SaveVideo and VideoHelperSuite file descriptors. Typed MIME, asset URL, and media kind are returned. Existing image callers keep their original output selection unless they request a media kind/node.
- `spindle.imageGen.cancelNative(jobId, userId?)`: cancels only a generation belonging to the calling extension and account. Extension jobs use a separate cancellation namespace from ImgGen.
- Generated filenames preserve their MIME extension using the existing media store. The existing authenticated asset endpoint supplies video byte-range serving and posters.

No database migrations, global setting changes, frontend core changes, or general-purpose job endpoints are introduced. Results remain preview assets; QuickGen does not automatically post to chat or the character gallery.

## Scope and limits

- Version 0.1 supports saved **ComfyUI** workflows. SwarmUI and arbitrary MCP runners are not implemented.
- A mapped positive prompt is required. The workflow's models and custom nodes must already be installed on the configured ComfyUI server. A source image requires an `init_image` mapping.
- For videos, use MP4 or WebM for browser playback. Other collected formats depend on the browser's codecs. Use **Final output node** when multiple nodes save the same kind of media.
- Progress and cancellation work while the extension backend is running; changing chats or closing the drawer does not end a job. A Lumiverse/extension restart ends live tracking. The last job and completed assets persist, but unfinished jobs are not automatically resumed.
- Imported field choices are used as saved. Refresh QuickGen after editing workflows or presets. ComfyUI validates additional model-specific limits, such as allowed frame counts.
- Mapped controls start from the imported workflow's values. Set a mapped seed to `-1` for a new random seed on each run. Separate sampler stages keep their individual values.
- Tests cover preset/workflow isolation, typed custom fields, sequencing and retry, the panel, and mocked ComfyUI HTTP/WebSocket media collection. Actual GPU generation must still be verified against your installed image and video workflows.
