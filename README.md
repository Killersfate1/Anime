# Relay / Mya

**Mya Local AI no longer requires Ollama.** The `desktop/` app manages a user-selected llama.cpp GGUF inference engine on `127.0.0.1:18931` and streams local conversation responses. Configure it in Settings; the model and runtime binaries are not committed to GitHub. See [desktop/README.md](desktop/README.md).


## Local Mya intelligence and avatar recovery

Mya now has an adjustable affectionate anime-girlfriend personality implemented over Mya's managed local GGUF inference, plus opt-in, rate-limited internet searches via Wikipedia or Brave Search. Browser research is off by default and never authorizes external actions. For frozen A-poses and washed-out materials, the renderer has reduced lighting, an independent procedural animation fallback, automatic still-pose detection, and a material/texture inspector. Windows visual acceptance remains open. See [desktop/README.md](desktop/README.md).

## Avatar formats

The Electron app supports both **GLB and VRM 0.x/1.0**. VRM avatars can use native humanoid mappings, expression presets and spring-bone updates when present. Character files are imported locally, not published to this public repository. After pulling changes, run `npm install` in `desktop/` to install `@pixiv/three-vrm`.

## Desktop companion — new source foundation

A new local-first Electron desktop app is available in [`desktop/`](desktop/README.md). It provides a transparent desktop avatar window, a SHA-256-checked import of the canonical GLB, Mya's managed local GGUF inference text/vision, user-selected screen observation with frame-change detection, short-lived screen context, session chat history, **push-to-talk transcription through a locally running whisper.cpp server**, reviewed categorized memories with editing/export, basic system voice output, and privacy/quiet controls.

**Run:** `cd desktop && npm install && npm start`. The app-managed llama.cpp engine and a selected GGUF model are required for chat/vision; local whisper.cpp on port 8080 is required for microphone transcription. Use `npm run check` and `npm test` for source-level verification. See `desktop/README.md` for setup and unverified features.

The exact uploaded GLB is **not** checked into GitHub: the binary upload is currently blocked by the connected GitHub writer. Import your unmodified GLB in the running desktop app. The Kawaii FBX clips are now exposed to the desktop renderer through an allowlisted bridge, with attempted humanoid retargeting to Mya's bones. This still requires visual verification/calibration; do not treat it as a finished animation setup. This is **not** a finished product or a tested Windows release. To commit the exact GLB from your Windows machine to `main`, use `scripts/import-mya-glb.ps1` after reviewing the public-repository/license implications.

## Unity Asset Studio

Unity 6000.1.5f1 project for David. Open this folder in Unity Hub. The saved scene is `Assets/Relay/Scenes/CompanionPreview.unity`; the original robot is a prefab with an editable `CompanionPreview` component.

The Unity project authors Mya's animation assets and retains its original preview. The separate `desktop/` Electron source is now present in this repository; desktop chat, local screen awareness and manually approved memory are initial implementations that still need Windows integration testing.

## Add Assets

1. Import assets you own or are licensed to use into `Assets/UserAssets`, using Unity's normal Import New Asset, Package Manager / My Assets, or prefab workflow.
2. VRM 0.x and 1.0 import/export support is supplied by pinned MIT-licensed UniVRM 0.131.2 packages. Import a `.vrm`, then place its generated prefab into the scene.
3. `Relay > Asset Studio` lets you place a prefab and optionally assign an animation clip through an Animator controller. Use compatible humanoid rigs for retargeting. Save your scene with Ctrl+S.
4. To bring an edited humanoid into the desktop app, use UniVRM's exporter to save a `.vrm` in `Exports`, then choose that file through Relay > Companion > Import VRM. Review export metadata and license permissions.

Unity scenes, shaders, scripts, Asset Store packages and Animator controllers do not run in the Electron app. The `.vrm` export transfers the supported avatar, materials, rig and expressions, not the complete Unity scene or arbitrary animation clips. Relay currently uses its own procedural gestures. This limitation is intentional and explicit; a full Unity runtime integration is a separate project.

The preview robot and its materials are original. No Sidekick files or assets are included. User-imported materials are not automatically cleared for Steam distribution.

## Optional Convai Preview

The imported **Convai SDK for Unity 4.6.0** is used by a separate `Relay > Open Convai Preview` scene. The original companion preview remains unchanged. This scene connects the SDK's speech-start/stop events to the original robot's gestures and uses its hands-free conversation mode. It does not replace Relay.exe's local model, share Relay history, or add Unity scripts to an exported VRM.

1. Open `Relay > Open Convai Preview`, select the original robot and enter your character's ID on **Convai Character**.
2. Configure your own credentials in **Edit > Project Settings > Convai SDK**. Never commit `Assets/Resources/ConvaiSettings.asset`; it is excluded in `.gitignore`. Do not paste a key into chat or a source file.
3. Enter Play Mode. On **Relay Convai Companion**, explicitly press **Connect to Convai (Cloud)**. This sends microphone audio/conversation data to Convai and uses your account's service allowance. Auto-connect is disabled. Disconnect or exit Play Mode to end the session.
4. For a blendshape-enabled character, configure the SDK's **Convai Lip Sync Component** and the matching face mapping. The original block robot has no viseme blendshapes; its bridge drives body gestures, not phoneme lip sync.

No cloud conversation was run during setup; credentials, service quality, account limits and acoustic interruption remain unverified. Convai is proprietary under its [terms](https://convai.com/tos), not an offline model supplied by the asset download. Before a public/Steam build, use the SDK's server-issued short-lived authentication and review service and asset redistribution terms. [Official setup](https://docs.convai.com/api-docs/plugins-and-integrations/convai-unity-sdk)
