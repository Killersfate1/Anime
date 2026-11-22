# Mya Desktop (Electron) — local-first runtime

This is an **initial executable desktop foundation**, not yet a verified, complete anime companion. It is separate from the Unity asset-authoring scene in `Assets/Relay`.

## Run on Windows

1. Install Node.js and Ollama. Download a local text+vision model, e.g. `ollama pull gemma3:4b`.
2. In a terminal at repository root: `cd desktop`, `npm install`, `npm start`.
3. Click **Import Mya's GLB** and choose your exact uploaded `7fa56a61494441448b35970c9f06a252.glb`. The app copies the bytes without changing the model to your OS user-data directory as `models/mya.glb`.
4. Chat runs against your local Ollama model only. You can change the installed model names in Settings.
5. For screen awareness, open Screen, click Find windows, choose the specific source, and click Start watching. The indicator should say WATCHING; Stop disables it immediately. Observation starts OFF every launch.
6. System TTS currently speaks dialogue using the installed Windows voices. **This is not yet phoneme-accurate lip sync.**

## Features implemented in source

- Transparent, resizable, always-on-top window with draggable toolbar and Ctrl+Shift+M click-through toggle.
- Runtime import of your exact GLB (no default substitute avatar), original mesh/material hierarchy preserved, procedural head/eye/breathing motion if the corresponding bones exist.
- Opt-in local Ollama chat, voice output through the OS speech synthesis interface, and a screen observation loop using selected Electron desktop capture source + local vision model.
- Observation is downscaled to 640×360, sampled no faster than 15s (30s economy), with abort-on-stop, screen-source validation, no stored screenshots and no cloud upload.
- Two independent matching model observations, 0.78+ vision confidence, significance threshold, and 60s cooldown are required before proposing spontaneous commentary.
- Quiet mode, memory opt-in, memory deletion, and local JSON settings.
- Renderer runs in Electron sandbox with context isolation, no Node integration, an IPC allowlist and navigation/pop-up blocking.

## Still incomplete or unverified

- **GitHub model copy**: the GLB is in the ChatGPT attachment but not in the repo; the connected GitHub file writer accepts UTF-8 text only. Import from your local GLB file at runtime as above.
- **Kawaii FBX in Electron:** The Unity project includes 416 FBX clips, and `MyaKawaiiSetup.cs` configures 12 in Unity. These Unity animations do **not** automatically play in Three.js. Native desktop retargeted animation export and actual runtime state integration remain to be built.
- **Facial expressions and real lip sync:** Uploaded GLB has no morph targets/embedded animations and no verified jaw bone. Do not fake a lip-sync capability. Rig extensions require dedicated work.
- **Screen awareness:** Only single still-frame local image analysis is implemented, not streaming game telemetry. Some Windows content can appear black or unavailable due to DRM/security. Do not claim to see unsupported windows.
- **Microphone/STT:** Not implemented; TTS is basic system voice, not an expressive neural voice.
- **Research and tools:** No autonomous web browsing, scheduling or computer actions; these require further consent and separate modules.
- **Memory:** Explicitly user-approved notes only; no cross-session conversation archive, semantic indexing, project memory or automatic consolidation yet.
- **Testing:** This execution environment did not run the Windows Electron GUI, Unity editor or Ollama; visual quality, platform-specific permissions, performance and end-to-end flow require local tests. Source-level code alone is not a pass.

## Privacy

No background capture at launch; a deliberate source selection and Start action are required. Every app restart stops observation. A selected frame is sent to a **locally running Ollama endpoint** at `127.0.0.1:11434`; Ollama's security/network configuration is the user's responsibility. No screenshot persistence is coded. The app only saves settings, the explicitly imported GLB copy, and manually approved memory notes.

## Integration design

The Unity animation pack should be retargeted to the exact GLB, then exported into animation clips that a desktop 3D renderer can play. The AI controller should emit structured, constrained intent such as `{ mood: 'happy', gesture: 'Cheer', speech: '...' }`. The avatar renderer should never depend on API access and the privacy gate must remain in charge of camera/microphone/screen permissions.
