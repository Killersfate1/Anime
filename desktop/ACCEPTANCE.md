# Mya interaction milestone — verification protocol

**Source committed to `main`.** Do not mark this milestone visually verified until a human runs it with the original model on Windows. No Windows desktop or Unity live session is connected to this development environment.

## Prerequisites

1. Get the current `main` of `Killersfate1/Anime`.
2. Install Node.js and the project's Electron dependencies: `cd desktop; npm install`.
3. Install Ollama; `ollama pull gemma3:4b`. Confirm the model supports vision.
4. For voice input, install/run the `whisper.cpp` server on `127.0.0.1:8080` with a speech-recognition model.
5. Supply the **exact** Mya GLB, SHA-256 `2fd4937d69168f4234854dd634f0135e3a92165f16b5918dc52942a78ed09618`. Import it through Mya's desktop UI, or place it under `Assets/UserAssets/Mya.glb`. The file itself is not committed to the public repository.
6. Execute `npm run check`, `npm test`, then `npm start`.

## Guided live acceptance test

| Step | Action | Expected result | Current status |
|---|---|---|---|
| 1 | Open Mya and click Settings > Check services | Canonical GLB verified; 12 Kawaii FBX files; Ollama reachable; whisper.cpp reachable | **Not run on Windows** |
| 2 | Select Mya's exact GLB | Canonical character appears, materials/hair/rig intact; no replacement model | **Not visually verified** |
| 3 | Click Test Kawaii wave | One properly retargeted wave, smooth exit to idle, no clipping/twitching | **Not visually verified** |
| 4 | Check facial diagnostics | No jaw or morph targets in supplied GLB; optional fallback starts OFF | **GLB contents verified; UI not verified** |
| 5 | Enable and manually calibrate mouth overlay | Speech approximation stays aligned to her face as head moves | **Not visually verified** |
| 6 | Click Test voice + mouth | System voice, Kawaii talk animation and approximate mouth motion occur together; final idle pose returns | **Code tests only** |
| 7 | Click microphone; speak; stop | Visible mic indicator, local Whisper transcription, transcript enters chat and reaches Ollama | **Not tested with devices/services** |
| 8 | Speak again while Mya is talking | Existing voice stops, recording starts; no overlapping speech | **Code path implemented, not device tested** |
| 9 | Cancel during recognition | No canceled transcript is allowed to create a delayed chat message | **Cancellation guards implemented; not device tested** |
| 10 | Ask a follow-up question | Reply uses recent session context; Clear session deletes that context | **Isolated logic checked** |
| 11 | Enable screen observation only after choosing source | Indicator shows WATCHING; recent observations inform chat; Stop clears them | **Code path implemented, not Windows tested** |
| 12 | Run a demanding game | GPU impact is acceptable; overlay stays responsive; no crashes | **Not performance tested** |

## Technical limitations that block release-grade acceptance

- The previously uploaded Mya GLB has **no facial morph targets and no jaw bone**. Imported VRMs may have native facial expression presets and spring bones. Real viseme-driven lip sync, blink and smile cannot be achieved by mapping nonexistent targets. The optional calibrated mouth overlay is reversible, but it is an approximation and must not be marketed as accurate phoneme lip sync. A new face rig or authoring pass on the canonical mesh is needed.
- Kawaii animation FBX retargeting runs in a Three.js bridge; it still needs visual pose calibration for this model, particularly shoulders, fingers, skirt and root pose.
- The desktop window has not been launched in a Windows GPU environment as part of this session. Automated syntax/unit tests check logic, not actual rendering.
- System voice is a basic OS TTS, not a high-quality expressive neural voice. The web search/tools subsystem remains incomplete.
- GitHub is public and contains third-party assets. Review redistribution permissions and restrict repository visibility before releasing model binaries or assets.

## Test results recording

After running the app locally, record the date, Windows version, GPU, Ollama model, whisper.cpp model, each step's PASS/FAIL, relevant screenshots/Console logs and whether facial overlay coordinates remain stable with animated head turns. Do not change the canonical GLB while diagnosing a failed animation: work on mappings/controllers instead.

### Success threshold for this milestone

One complete real-device interaction must be observed:
**user talks (mic indicator active) → local transcription → Mya generates a grounded answer → voice begins → animated talk gesture and visible mouth motion → returns to idle → interruption stops speech without ghost messages.**

This is still an **open acceptance gate**, not a claim that it has already passed.

## Additional VRM compatibility tests

1. Import a licensed VRM 0.x avatar (without distributing it). Confirm face orientation, shading, rig and spring-bone motion.
2. Verify the Diagnostics panel identifies the selected format as `VRM 0.x`; test native preset mouth shapes and blinking while speaking.
3. Verify experimental Kawaii idle and wave motions, and inspect skirt/fingers/shoulders for retargeting problems.
4. Switch from VRM to GLB and back; confirm that the previously selected model remains recoverable and no unapproved replacements occur.
5. If available, repeat with a VRM 1.0 model. Do not claim VRM 1.0 visual verification from the VRM 0.x test alone.

These tests require Windows rendering and have **not** been completed in this session.
