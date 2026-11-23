# Mya Desktop (Electron) — local-first runtime

This is an **initial executable desktop foundation**, not yet a verified, complete anime companion. It is separate from the Unity asset-authoring scene in `Assets/Relay`.

## Mya's local AI girlfriend personality and internet research

Mya runs conversations through your **local Ollama** model (default `gemma3:4b`). Settings now includes **Companion mode** (girlfriend, best friend, gaming partner, productivity, friendly), **Affection**, and **Talkativeness**. The default is an affectionate, lively, playful, independent anime-girlfriend personality. The model is not packaged with the application; install Ollama and a local model first.

**Internet access is optional and starts OFF.** Enable it in Settings to let Mya look up public information while keeping the chat model local. Public search engines receive a brief sanitized query only; neither saved memories nor screen captures are passed to search engines. This permission is separate from screen observation. Supported providers:

- **Wikipedia**: keyless online reference searches (not reliable for live prices, product comparison, or current game patches).
- **Brave Search**: broader web search with a user-supplied Brave Search API key stored in the app's local user-data directory. The key is never forwarded to the renderer after saving.

Mya can recognize obvious user requests to look things up. If **Auto research** is checked, a local Ollama planning call can decide whether public research may help for technical/game/product questions; queries are rate-limited to 12/hour with a five-minute cache. The answer displays retrieved source buttons after the chat. All web results are untrusted data; they do not authorize purchases, sending messages, running commands or changes to accounts. Chat and local memory work without any internet research. Verify sources rather than treating a search snippet as an independently confirmed fact.

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

1. Install Node.js and Ollama. Download a local text+vision model, e.g. `ollama pull gemma3:4b`.
2. In a terminal at repository root: `cd desktop`, `npm install`, `npm start`.
3. Click **Import GLB / VRM** and choose your exact uploaded `7fa56a61494441448b35970c9f06a252.glb`. The app copies the bytes without changing the model to your OS user-data directory as `models/mya.glb`.
4. Chat runs against your local Ollama model only. You can change the installed model names in Settings.
5. For screen awareness, open Screen, click Find windows, choose the specific source, and click Start watching. The indicator should say WATCHING; Stop disables it immediately. Observation starts OFF every launch.
6. System TTS currently speaks dialogue using the installed Windows voices. **This is not yet phoneme-accurate lip sync.**

## Mya speech + expression integration

The current implementation coordinates local transcribed user speech, Ollama responses, system voice synthesis, Kawaii body gestures and a facial-control adapter. The avatar enters a waiting/thinking pose while listening/transcribing; speech start triggers an emotional gesture and then the talking animation. Ending or interrupting speech returns her to idle. There are guards against canceled transcriptions creating delayed chat messages.

The supplied canonical Mya GLB has **no facial morph targets or jaw bone**. The optional mouth overlay in Settings is a **calibration-only visual approximation** and starts disabled. Manually adjust X/Y/depth/width/height and flip direction if necessary. The exact character geometry is not replaced or rewritten. The system can recognize facial morphs or a jaw in future re-rigged versions without depending on this overlay.

For a no-services-required animation preview, import the exact GLB, open Settings, try **Test Kawaii wave** and **Test voice + mouth**. For live services, choose **Check services** to see the validated model location, Kawaii clip count, and localhost Ollama/whisper.cpp connection status.

**These are features in code, not verified visual results.** Use [ACCEPTANCE.md](ACCEPTANCE.md) for the Windows end-to-end test and clear pass/fail criteria. GitHub Actions checks syntax and unit-test logic on changes to `desktop/`; it cannot validate animations, audio devices or rendering.

## Push-to-talk voice and local speech recognition

Voice input is now coded through the **🎙 microphone button**. It requires a **local whisper.cpp server** listening at `127.0.0.1:8080`, with a compatible Whisper model loaded. See [whisper.cpp server setup](https://github.com/ggml-org/whisper.cpp/tree/master/examples/server). Ollama supplies the conversation response; whisper.cpp supplies speech recognition. The two are independent.

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

Run `npm run check` to syntax-check the Electron source and `npm test` for initiative, WAV encoding, and session-context unit tests. These are not replacements for Windows Electron, microphone, Ollama, Kawaii rig, and Play Mode tests.

## Features implemented in source

- Transparent, resizable, always-on-top window with draggable toolbar and Ctrl+Shift+M click-through toggle.
- Runtime import of your exact GLB (no default substitute avatar), original mesh/material hierarchy preserved, procedural head/eye/breathing motion if the corresponding bones exist.
- Opt-in local Ollama chat, voice output through the OS speech synthesis interface, and a screen observation loop using selected Electron desktop capture source + local vision model.
- Observation is downscaled to 640×360, sampled no faster than 15s (30s economy), with abort-on-stop, screen-source validation, no stored screenshots and no cloud upload.
- Two independent matching model observations, 0.78+ vision confidence, significance threshold, and 60s cooldown are required before proposing spontaneous commentary.
- Quiet mode, memory opt-in, memory deletion, and local JSON settings.
- Renderer runs in Electron sandbox with context isolation, no Node integration, an IPC allowlist and navigation/pop-up blocking.

## Still incomplete or unverified

- **GitHub model copy**: the GLB is in the ChatGPT attachment but not in the repo; the connected GitHub file writer accepts UTF-8 text only. Import from your local GLB file at runtime as above. The importer verifies the GLB's structure; the original SHA-256 is recognized, and an explicitly selected different skinned avatar requires user confirmation. A current avatar is backed up before replacement. To upload the exact GLB to public GitHub `main` from Windows, use the verified `scripts/import-mya-glb.ps1` script after checking your licensing/privacy obligations.
- **Kawaii FBX in Electron:** This branch now includes `desktop/kawaii.mjs`, an experimental runtime retargeting bridge that loads 12 allowlisted FBX clips and maps the inspected bone names to the canonical GLB skeleton. **No actual Windows runtime/pose test has been run**, so hands, orientation, clip loops and facial/cloth interactions may still require corrective calibration. Unity and Three.js remain separate runtimes.
- **Facial expressions and real lip sync:** Uploaded GLB has no morph targets/embedded animations and no verified jaw bone. Do not fake a lip-sync capability. Rig extensions require dedicated work.
- **Screen awareness:** Only single still-frame local image analysis is implemented, not streaming game telemetry. Some Windows content can appear black or unavailable due to DRM/security. Do not claim to see unsupported windows.
- **Microphone/STT:** Local push-to-talk transcription is implemented through whisper.cpp on 127.0.0.1:8080 but not validated on the user's Windows computer. TTS is basic system voice, not an expressive neural voice.
- **Research and tools:** No autonomous web browsing, scheduling or computer actions; these require further consent and separate modules.
- **Memory:** Explicitly user-approved notes only; no cross-session conversation archive, semantic indexing, project memory or automatic consolidation yet.
- **Testing:** Five pure-JS initiative logic cases passed isolated tests earlier; newer source syntax and WAV/context checks passed in isolation. The Node test suite is committed but not executed as a full Windows/Electron integration test. This execution environment did not run the Windows Electron GUI, Unity editor or Ollama; visual quality, platform-specific permissions, performance and end-to-end flow require local tests. Source-level code alone is not a pass.

## Privacy

No background capture at launch; a deliberate source selection and Start action are required. Every app restart stops observation. A selected frame is sent to a **locally running Ollama endpoint** at `127.0.0.1:11434`; Ollama's security/network configuration is the user's responsibility. No screenshot persistence is coded. The app only saves settings, the explicitly imported GLB copy, and manually approved memory notes.

## Integration design

The Unity animation pack should be retargeted to the exact GLB, then exported into animation clips that a desktop 3D renderer can play. The AI controller should emit structured, constrained intent such as `{ mood: 'happy', gesture: 'Cheer', speech: '...' }`. The avatar renderer should never depend on API access and the privacy gate must remain in charge of camera/microphone/screen permissions.
