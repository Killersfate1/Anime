# AI KAWAII / Mya — Asset audit and first implementation

This branch adds a **non-destructive avatar/animation foundation**, not a complete AI companion or a packaged desktop application.

## Verified from the uploaded GLB

- Uploaded file: `7fa56a61494441448b35970c9f06a252.glb` (2,726,104 bytes; glTF 2.0).
- 1 scene, 250 nodes, 14 meshes, 232 skin joints, 12 materials, 4 textures.
- The skeleton has named pelvis, torso, neck/head, arms, hands, fingers, legs, eyes, hair and clothing bones.
- It contains **no GLB animations**.
- It contains **no mesh morph targets / facial blendshapes**, so facial expressions and phoneme lip sync are **not** yet supported.
- No obvious jaw bone was found in the named skeleton.
- Some mesh names are garbled in the supplied GLB; skeletal names required for animation mapping are readable.
- This upload is not a VRM container. Do not assume VRM expression metadata or VRM spring bones exist.

The GLB was supplied through conversation upload and **is not yet inside this repository**. Preserve the upload unchanged; import your owned copy into `Assets/UserAssets`.

## Verified from repository

- Unity 6000.1.5f1 project already contains `com.vrmc.gltf` (UniGLTF) and UniVRM packages.
- `Assets/KAWAII_ANIMATIOMS_100/Assets/Animations` has 416 FBX animation files.
- Example animation importer metadata declares Humanoid (`animationType: 3`).
- `Assets/Relay` has a Unity asset-authoring preview and optional Convai demonstration.
- The full Relay Electron desktop application (screen observation, memory, speech, AI research, overlay) is not in this repository.

## New code in this branch

- `Assets/Relay/Scripts/MyaKawaiiBehaviour.cs`: event-driven emotional/gesture behavior and an explicit, opt-in initiative gate. It does not monitor screen or microphone. Upstream services have to provide verified events and consent.
- `Assets/Relay/Editor/MyaKawaiiSetup.cs`: Unity menu for non-destructively generating a Humanoid Avatar from known GLB joint names and an Animator Controller using 12 actual Kawaii FBX clips. It does not remove the original preview robot.

### Local setup/validation in Unity

1. Open **Anime** in Unity 6000.1.5f1. Import the exact user-provided GLB into `Assets/UserAssets` using the project's glTF import workflow. Confirm materials are correct.
2. Add the imported model to a scene and select its **root instance** in the Hierarchy, not the original preview robot.
3. Choose **Relay > Mya > Configure Selected GLB with Kawaii Animations**. The setup checks clips first, creates the Humanoid Avatar when needed, and stops rather than pretending an invalid rig is usable.
4. Choose **Relay > Mya > Validate Selected Mya Rig**. Confirm `humanoid=True` and `controller=MyaKawaii` in the Console.
5. Enter Play Mode. Verify Idle, LookAround, Talk, Wave, Cheer, and Shy on this exact model and inspect hands, shoulders, hair, skirt, scale, orientation, root motion and pose clipping. Set `MyaKawaiiBehaviour.speaking` from a trusted voice service or use its methods from a local test script.
6. Do not describe retargeting as verified until these Unity runtime checks pass.

### Known limitations / next implementation gates

- **Import validation:** The GLB is not committed and no Unity Play Mode render or compile run has been performed in this session.
- **Retargeting:** GLB-to-Humanoid AvatarBuilder may reject unusual rest poses. If the auto-build reports invalid, fix its T-pose/bone orientation manually without modifying or replacing the character.
- **Expressions/lip sync:** Need facial rig or corrective face morphs made for this exact mesh (not just audio amplitude mapped to nonexistent blendshapes). Avoid a fake "lip sync ready" label.
- **Animation playback:** Imported FBX loop settings need runtime verification; the setup does not change the purchased assets.
- **Screen/AI/voice/memory/internet/desktop overlay:** Not implemented by these scripts. Restore/find Relay Electron code or create a separate desktop application and integrate it through a permission-controlled event/voice interface.
- **Privacy:** Observation is OFF by default; do not connect screen/microphone data to services without explicit user approval.
- **Distribution:** Check asset licenses before repackaging the model, Kawaii animation data, Convai SDK, or other vendor components.

The goal of this branch is to give Mya her *own body* before linking screen intelligence, voice and memory. Preserve the uploaded GLB as the canonical asset and keep the original Unity scene and robot intact until the user approves replacement.
