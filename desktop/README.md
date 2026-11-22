# Mya Desktop (Electron) — local-first runtime

This is an **initial executable desktop foundation**, not yet a verified, complete anime companion. It is separate from the Unity asset-authoring scene in `Assets/Relay`.

## Run on Windows

1. Install Node.js and Ollama. Download a local text+vision model, e.g. `ollama pull gemma3:4b`.
2. In a terminal at repository root: `cd desktop`, `npm install`, `npm start`.
3. Click **Import Mya's GLB** and choose your exact uploaded `7fa56a61494441448b35970c9f06a252.glb`. The app copies the bytes without changing the model to your OS user-data directory as `models/mya.glb`.
4. Chat runs against your local Ollama model only. You can change the installed model names in Settings.
5. For screen awareness, open Screen, click Find windows, choose the specific source, and click Start watching. The indicator should say WATCHING; Stop disables it immediately. Observation starts OFF every launch.
6. System TTS currently speaks dialogue using the installed Windows voices. **This is not yet phoneme-accurate lip sync.**

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

- **GitHub model copy**: the GLB is in the ChatGPT attachment but not in the repo; the connected GitHub file writer accepts UTF-8 text only. Import from your local GLB file at runtime as above. The importer verifies its SHA-256 against `avatar-manifest.json` so no substitute model is silently accepted. To upload the exact GLB to public GitHub `main` from Windows, use the verified `scripts/import-mya-glb.ps1` script after checking your licensing/privacy obligations.
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
