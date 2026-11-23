# Mya Desktop (Electron) — local-first runtime

This is an **initial executable desktop foundation**, not yet a verified, complete anime companion. It is separate from the Unity asset-authoring scene in `Assets/Relay`.

## Mya's bold girlfriend personality

Mya's default girlfriend personality is now **very flirtatious (0.95), affectionate (0.95), and talkative (0.90)**. She uses charming banter, confident teasing, romantic warmth and engaging longer replies. The personality adapts to context; serious technical questions and gameplay strategy should stay focused rather than becoming canned compliments.

Settings includes **Flirtation** and **Mature banter** controls. Mature banter enables suggestive innuendo, playful naughty jokes, and occasional adult language while retaining consent, non-graphic language and emotional independence. These settings apply only to the girlfriend personality, not the friend, gaming or productivity modes. It does not make the AI generate graphic sexual content.

Older installations with exactly the former default values are upgraded to the stronger settings; deliberately customized personality values are preserved. The local GGUF model still determines how consistently Mya follows the persona. Changes are source-level until actually tested with your selected model.

## Mya's neural anime voice (Kokoro, on-device)

Mya has an integrated **Kokoro 82M neural speech engine** in the Electron application. This is different from Windows' basic system voice: Kokoro generates expressive, natural-sounding speech **on this computer** with a light model, not using a cloud voice API or an independent speech server. A Node worker keeps speech synthesis off the 3D rendering thread.

In **Settings → Mya's beautiful voice**, click **Install neural voice** once to explicitly approve downloading the Kokoro q8 model assets from Hugging Face to your local user-data cache. After successful setup, the installed model is loaded automatically and does **not** require network access to speak. Choose **Heart** (warm, sweet) or **Bella** (bright, expressive); Nicole, Sarah, Kore, Sky, Emma and Lily are also available. Click **Hear Mya's voice** to test her. Windows system speech is available as a backup.

Mya speaks answers in sentence-sized chunks without recording or saving generated WAV files. Her mouth opening follows the generated waveform amplitude, an improvement over arbitrary mouth cycles; **this is not phoneme-accurate lip-sync**. Interrupting Mya stops active playback and discards pending speech. English voices are currently the best-supported; these are distinct licensed synthetic presets, not voice clones of real people.

The implementation is open-source code with an externally obtained model checkpoint. **Kokoro weights are Apache-2.0**; the application does not claim to own or train those weights. The app requires `kokoro-js` and Transformers.js dependencies, installed by `npm install`. Exact voice quality and model loading need Windows device verification.

### Building a single-launch Windows Mya app

The desktop application can launch its **own local AI brain automatically** if a compatible engine and instruction-tuned GGUF are bundled. The Windows installer build intentionally refuses to run without a valid bundled model.

1. Download the official Windows `llama-server.exe` build and copy the EXE **and its required DLLs** into `desktop/runtime/`.
2. Copy **one** properly licensed, compatible instruction-tuned GGUF to `desktop/runtime/models/`. Carefully review the model license before distributing an installer.
3. On Windows, run `cd desktop` (only if not already there), `npm install`, then `npm run build:windows`.
4. Electron Builder stages the runtime as a separate app resource; when Mya launches she detects the bundled GGUF and starts the inference process herself. No separate user-launched server or Ollama window.
5. Kokoro voice assets still require the user's first explicit installation unless packaged separately under an appropriate license. Once installed, they are cached for offline use.

**Release status:** This is a packaging path, not a finished downloadable installer. No real GGUF server, installed neural voice, audio output, or Windows end-to-end workflow has been verified during this development session. Bundled models significantly increase installer size and RAM use; choose weights appropriate for target PCs.

## Mya's integrated local intelligence

**There is no AI service connection flow.** Mya manages her own inference process on this PC. No Ollama, Convai, cloud AI account, API-key login, external AI-service selector, or manual Start AI button is part of the application UI.

When Mya starts, she checks for her own licensed language model and runtime and launches them internally. The user sees only whether **Mya is awake**, **waking up**, or **missing her local brain files**. Responses stream into the chat and preserve recent conversation context; approved memories remain separate.

**Important:** the source repository currently excludes the model weights and native inference executable. This is intentional because weights and redistributable binaries have separate licenses and can be several gigabytes. Therefore a fresh source checkout cannot hold real conversations until those files are supplied. The UI does not pretend otherwise.

### Packaging the local brain (developer/build step, not an AI-service connection)

1. Place an officially obtained, compatible Windows `llama-server.exe` and its DLLs inside `desktop/runtime/`.
2. Place exactly one compatible, licensed instruction-tuned GGUF in `desktop/runtime/models/`.
3. Run `npm run build:windows` on Windows. A preflight prevents packaging without the required local brain.
4. The built application discovers and starts its own local model when Mya launches. Internally, inference remains restricted to loopback with a per-launch authentication token. No account or AI-provider connection is needed.

Optional internet **research** is separate from AI inference and remains disabled by default; if enabled, search queries are sent to the chosen public search source. It never uploads Mya's conversations or screen captures to a hosted AI model.

Typing and speaking Mya's replies can work entirely offline after components are installed. Microphone *speech recognition* is a separate unfinished integration: this source still expects a local recognizer on port 8080 and does not yet bundle one. Do not advertise fully integrated hands-free voice conversation until that is repaired and tested on Windows.

## Mya's local AI girlfriend personality and internet research

Mya runs conversations through her own local language model when it is included in the build. Settings now includes **Companion mode** (girlfriend, best friend, gaming partner, productivity, friendly), **Affection**, and **Talkativeness**. The default is an affectionate, lively, playful, independent anime-girlfriend personality. The model and runtime must be packaged for Mya to converse; no cloud model API is used.

**Internet access is optional and starts OFF.** Enable it in Settings to let Mya look up public information while keeping the chat model local. Public search engines receive a brief sanitized query only; neither saved memories nor screen captures are passed to search engines. This permission is separate from screen observation. Supported providers:

- **Wikipedia**: keyless online reference searches (not reliable for live prices, product comparison, or current game patches).
- **Brave Search**: broader web search with a user-supplied Brave Search API key stored in the app's local user-data directory. The key is never forwarded to the renderer after saving.

Mya can recognize obvious user requests to look things up. If **Auto research** is checked, a private Mya GGUF planning call can decide whether public research may help for technical/game/product questions; queries are rate-limited to 12/hour with a five-minute cache. The answer displays retrieved source buttons after the chat. All web results are untrusted data; they do not authorize purchases, sending messages, running commands or changes to accounts. Chat and local memory work without any internet research. Verify sources rather than treating a search snippet as an independently confirmed fact.

## White avatar / frozen A-pose fixes

The desktop renderer's previous high lighting values were reduced to avoid washing out VRM/GLB materials. Both previously uploaded character files contain genuine, colorful embedded images (GLB: 4 WebP; VRM: 4 PNG), so a white character is not necessarily missing its original artwork. A new **Try texture compatibility mode** button applies temporary basic shaders using the model's already decoded color maps; **Restore original shaders** reverses it. The original file is never changed. In **Settings → Animation diagnostics**, the new material inspector reports mesh/material counts and embedded/assigned textures. This distinguishes an overexposure problem from a texture-import problem; if images exist but no material maps are assigned, inspect the imported character/shader rather than painting the model with a substitute material.

The VRM loader also now sets `autoUpdateHumanBones: false`. Otherwise the library overwrites raw-bone animation with the normalized rest pose during `VRM.update()`—a direct cause of a persistently frozen A-pose when an animation system drives raw bones. This is supported by three-vrm's own humanoid API documentation, and leaves expressions and spring-bone updates enabled.

Mya now has **procedural idle and gesture motion** for mapped GLB or VRM humanoid bones when Kawaii FBX retargeting is unavailable. If the Kawaii idle clip claims to work but key bone rotations remain unchanged for five seconds, the renderer automatically switches to that backup. The **Use backup movement** checkbox lets you select this explicitly at any time. Kawaii FBX files remain present and are not overwritten; correct Kawaii retargeting still needs live visual testing.

Neither lower lighting nor procedural movement proves the avatar looks correct on your particular Windows machine. A fully white model can still indicate missing textures or unsupported source materials, and Kawaii hands/shoulders may need a per-rig calibration.

## GLB and VRM character support

The Mya desktop app accepts **both `.glb` and `.vrm`** through the same Import/Change Avatar button. VRM 0.x and VRM 1.0 are interpreted with the local `@pixiv/three-vrm` loader; GLB support remains unchanged. Every user-selected avatar must include a usable skinned humanoid model, embedded assets and a valid glTF binary structure. A `.vrm` must contain the appropriate VRM extension.

- VRM avatars use their native expression presets (including available vowel mouth shapes, smile/sad and blink), their standardized humanoid bone mappings, and their built-in spring-bone updates when the file provides those features.
- The 12 imported Kawaii FBX clips still load **lazily**, with experimental humanoid retargeting for either format. Rig quality, poses, fingers and garment collisions need visual verification in the app.
- VRM 0.x has an automatic orientation correction. VRM 1.0 uses its native orientation.
- The original GLB and any VRM file remain separate, with only a user-confirmed avatar selected. Existing files aren't silently discarded. Avatar files are stored locally, never automatically committed to GitHub.
- Imported VRM usage rights are defined by the model's embedded license. In particular, the previously supplied VRM disallows redistribution, modification and commercial use: **do not commit or distribute that model** without appropriate permission.

**After pulling `main`, run `npm install` again** to install `@pixiv/three-vrm` before running `npm start`. No CDN or external model server is needed to render an imported VRM.

## Windows startup and model-import recovery

The previous hard-coded model-hash refusal was replaced with **GLB/VRM structure validation and an explicit confirmation dialog**. The original uploaded Mya GLB is still recognized by SHA-256. If you intentionally select a different GLB with a usable skinned rig, Mya warns that it differs, shows the file/hash/joint count, and lets you approve it. Existing avatars are backed up before replacement. User-approved model selection is stored locally; no avatar bytes are published to GitHub. External buffers and remote textures are rejected, so import a self-contained GLB.

To update an already cloned copy from its `desktop` folder:

```powershell
git pull origin main
npm install
npm run check
npm test
npm start
```

Do **not** use `cd desktop` again if your PowerShell prompt already ends in `\\desktop`.

**Startup memory mitigation:** The binary GLB and Kawaii FBX files are now sent over typed-array IPC rather than base64 text. At launch, only the idle animation is parsed; other Kawaii gestures load sequentially on demand and the cache retains at most four actions. A single-instance lock stops duplicate Electron windows from consuming memory. These changes reduce pressure but don't prove the underlying Windows V8/GPU crash is solved.

**Optional GPU-driver fallback** in PowerShell:

```powershell
$env:MYA_SOFTWARE_RENDERING = '1'
npm start
```

Electron now records renderer/GPU crashes to `mya-crashes.log` inside its user-data folder. No screen images, chat content or microphone data are included in that crash log. The Chromium `crashpad not connected` message is not on its own proof of the original crash cause. Do not raise Node's heap limit blindly to hide a leak.

## Run on Windows

If your terminal already ends in `\\desktop`:

```powershell
git pull origin main
npm install
npm run check
npm test
npm start
```

Mya automatically starts her local intelligence when its model files are present. Import your GLB/VRM and test the avatar separately. The microphone needs local whisper.cpp; the screen observer needs a multimodal-capable GGUF and, when required, a matching mmproj GGUF. No Ollama installation is necessary.

## Mya speech + expression integration

The current implementation coordinates local transcribed user speech, Mya GGUF responses, system voice synthesis, Kawaii body gestures and a facial-control adapter. The avatar enters a waiting/thinking pose while listening/transcribing; speech start triggers an emotional gesture and then the talking animation. Ending or interrupting speech returns her to idle. There are guards against canceled transcriptions creating delayed chat messages.

The supplied canonical Mya GLB has **no facial morph targets or jaw bone**. The optional mouth overlay in Settings is a **calibration-only visual approximation** and starts disabled. Manually adjust X/Y/depth/width/height and flip direction if necessary. The exact character geometry is not replaced or rewritten. The system can recognize facial morphs or a jaw in future re-rigged versions without depending on this overlay.

For a no-services-required animation preview, import the exact GLB, open Settings, try **Test Kawaii wave** and **Test voice + mouth**. For live services, choose **Check services** to see the validated model location, Kawaii clip count, and Mya local inference/whisper.cpp status.

**These are features in code, not verified visual results.** Use [ACCEPTANCE.md](ACCEPTANCE.md) for the Windows end-to-end test and clear pass/fail criteria. GitHub Actions checks syntax and unit-test logic on changes to `desktop/`; it cannot validate animations, audio devices or rendering.

## Push-to-talk voice and local speech recognition

Voice input is now coded through the **🎙 microphone button**. It requires a **local whisper.cpp server** listening at `127.0.0.1:8080`, with a compatible Whisper model loaded. See [whisper.cpp server setup](https://github.com/ggml-org/whisper.cpp/tree/master/examples/server). Mya's private GGUF engine supplies the conversation response; whisper.cpp supplies speech recognition. The two are independent.

- Click 🎙 to authorize a single microphone recording, then click again to stop (or wait up to 15 seconds).
- Audio is converted to standard 16 kHz mono PCM WAV in memory and submitted to localhost only. No audio recordings are saved to disk by this app.
- A persistent microphone indicator displays when capture is active. Closing or minimizing cancels recording. A locally transcribed utterance becomes a user chat message.
- No wake word, hands-free always-listening, full-duplex barge-in, or expressive neural TTS is implemented yet. The existing voice response is system TTS, not accurate lip sync.

## Conversation continuity

Mya now has recent in-memory context for **12 question/answer turns**, with a **Clear session** control. This context is deliberately not saved automatically. Manually approved memories remain separate in local settings.

## Reviewed long-term memories

The Settings panel supports **manually approved** long-term notes, preferences, projects, shared activities and conversation memories. Each entry can be reviewed, edited or individually deleted. Export writes JSON only after a user chooses a destination in a native Save dialog; Erase all requires confirmation. None of these memory actions infer private facts from screenshots or microphone recordings.

When Mya answers, she retrieves up to twelve approved memories by a simple keyword-matching rank. This is **not** vector search or advanced semantic memory yet. Conversation context from the current session remains separate and is never saved automatically.

## Screen context and analysis performance

When screen monitoring is explicitly enabled, the app analyzes selected windows/displays. Before asking the local vision model for another analysis, it compares a 96×54 BGRA thumbnail to the last one and skips practically unchanged frames. The last approved activity summary is available to chat for at most 60 seconds while monitoring remains enabled; Stop clears it immediately. The screen image is not written to disk.

Screen text, OCR, and model-generated descriptions are treated as untrusted data and should never authorize actions. Visual event recognition still requires real-game verification to establish accuracy.

## Verification commands

Run `npm run check` to syntax-check the Electron source and `npm test` for initiative, WAV encoding, and session-context unit tests. These are not replacements for Windows Electron, microphone, GGUF runtime, Kawaii rig, and Play Mode tests.

## Features implemented in source

- Transparent, resizable, always-on-top window with draggable toolbar and Ctrl+Shift+M click-through toggle.
- Runtime import of your exact GLB (no default substitute avatar), original mesh/material hierarchy preserved, procedural head/eye/breathing motion if the corresponding bones exist.
- Opt-in local GGUF chat, voice output through the OS speech synthesis interface, and a screen observation loop using selected Electron desktop capture source + local vision model.
- Observation is downscaled to 640×360, sampled no faster than 15s (30s economy), with abort-on-stop, screen-source validation, no stored screenshots and no cloud upload.
- Two independent matching model observations, 0.78+ vision confidence, significance threshold, and 60s cooldown are required before proposing spontaneous commentary.
- Quiet mode, memory opt-in, memory deletion, and local JSON settings.
- Renderer runs in Electron sandbox with context isolation, no Node integration, an IPC allowlist and navigation/pop-up blocking.

## Still incomplete or unverified

- **GitHub model copy**: the GLB is in the ChatGPT attachment but not in the repo; the connected GitHub file writer accepts UTF-8 text only. Import from your local GLB file at runtime as above. The importer verifies the GLB's structure; the original SHA-256 is recognized, and an explicitly selected different skinned avatar requires user confirmation. A current avatar is backed up before replacement. To upload the exact GLB to public GitHub `main` from Windows, use the verified `scripts/import-mya-glb.ps1` script after checking your licensing/privacy obligations.
- **Kawaii FBX in Electron:** The repository includes `desktop/kawaii.mjs`, an experimental runtime retargeting bridge that loads 12 allowlisted FBX clips and maps the inspected bone names to the canonical GLB skeleton. **No actual Windows runtime/pose test has been run**, so hands, orientation, clip loops and facial/cloth interactions may still require corrective calibration. Unity and Three.js remain separate runtimes.
- **Facial expressions and real lip sync:** Uploaded GLB has no morph targets/embedded animations and no verified jaw bone. Do not fake a lip-sync capability. Rig extensions require dedicated work.
- **Screen awareness:** Only single still-frame local image analysis is implemented, not streaming game telemetry. Some Windows content can appear black or unavailable due to DRM/security. Do not claim to see unsupported windows.
- **Microphone/STT:** Local push-to-talk transcription is implemented through whisper.cpp on 127.0.0.1:8080 but not validated on the user's Windows computer. TTS is basic system voice, not an expressive neural voice.
- **Research and tools:** No autonomous web browsing, scheduling or computer actions; these require further consent and separate modules.
- **Memory:** Explicitly user-approved notes only; no cross-session conversation archive, semantic indexing, project memory or automatic consolidation yet.
- **Testing:** Five pure-JS initiative logic cases passed isolated tests earlier; newer source syntax and WAV/context checks passed in isolation. The Node test suite is committed but not executed as a full Windows/Electron integration test. This execution environment did not run the Windows Electron GUI, Unity editor or an actual GGUF model; visual quality, platform-specific permissions, performance and end-to-end flow require local tests. Source-level code alone is not a pass.

## Privacy

No background capture at launch; a deliberate source selection and Start action are required. Every app restart stops observation. A selected frame is sent to Mya's **locally managed GGUF inference engine** at `127.0.0.1:18931`; its authenticated process is started only by user action. No screenshot persistence is coded. The app only saves settings, the explicitly imported GLB copy, and manually approved memory notes.

## Integration design

The Unity animation pack should be retargeted to the exact GLB, then exported into animation clips that a desktop 3D renderer can play. The AI controller should emit structured, constrained intent such as `{ mood: 'happy', gesture: 'Cheer', speech: '...' }`. The avatar renderer should never depend on API access and the privacy gate must remain in charge of camera/microphone/screen permissions.
