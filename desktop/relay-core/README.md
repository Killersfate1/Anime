# Relay local AI core — Steam-oriented architecture

This directory is independent of Unity scenes, meshes, shaders and animations. The Windows application invokes it from its Electron main process. No cloud inference or Ollama account is required. The native llama.cpp executable is owned and launched by the desktop application, bound to loopback with a per-run secret. This is app-managed process isolation, **not** a linked in-process llama.cpp library; a future native DLL/Node-API bridge could replace the transport without changing memory modules.

## Components

| Component | Responsibility |
|---|---|
| LocalInferenceEngine | Owns local quantized GGUF inference through bundled llama.cpp |
| ConversationManager | Persistent session ID, prompt context, completed exchange pipeline |
| MemoryRepository | SQLite on-disk WAL, FTS5, approved/pending fact states, episodes, vectors, conversation transcripts, privacy reset |
| MemoryExtractor | Conservative extraction of user-stated candidate facts; sensitive facts never silently approved |
| MemoryRetriever | Hybrid FTS5, local dense-vector cosine similarity, recency and importance ranking |
| MemoryConsolidator | Periodically summarizes completed exchanges into time-stamped episodes; handles duplicates |
| RelationshipStateManager | Interaction counts, shared-experience counts, confirmed communication preferences — **not simulated human feelings** |
| LocalEmbeddingProvider | Separate local ONNX embedding worker, optional one-time install and offline inference |
| RelayLocalInterface | Allowlisted versioned JSON command/event protocol for Electron or later opt-in Unity bridge |

## SQLite storage schema

The database is created in Electron's per-user \`app.getPath('userData')\` directory as \`relay-memory.sqlite\`. Tables are \`conversations\`, \`messages\`, \`facts\`, \`episodes\`, \`vectors\`, \`relationship\`, and \`meta\`. \`facts_fts\` and \`episodes_fts\` use SQLite FTS5 with automatic insert/update/delete triggers. Embedding values are numeric Float32 blobs with the embedding model ID. No cloud sync.

The database is in WAL mode with restricted file permissions as supported by the OS. Data at rest is **not encrypted** by this implementation; Windows full-disk encryption/DPAPI integration and a threat-model review are still needed for a security-hardened commercial release. Avoid putting secrets in memories, exports or debug logs.

The first run imports the pre-existing approved `memories.json` entries into SQLite in a transaction. After committing the imported facts and migration marker, the old JSON copy is deleted to prevent resurrection of memories later deleted from SQLite.

## Dialogue pipeline

1. Accept typed or explicitly transcribed user text via Electron IPC (no model inference in Unity's render thread).
2. Read the persisted conversation session, relevant approved facts and recent episodes.
3. Score context using FTS5 plus dense-vector similarity when the optional local embedding model is installed, with recency and importance as additional signals.
4. Construct Mya/Relay personality prompt and a bounded history from SQLite. Memory content is marked as **untrusted reference data**, never instructions.
5. Generate the answer through the local llama.cpp GGUF backend, streaming output to Electron.
6. Persist the complete user/assistant turn only on successful generation; interrupted or empty replies are not archived.
7. Propose durable facts only from the user message. Candidates are \`pending\` until explicitly approved. A contradiction does not overwrite an active fact without user review.
8. Update interaction metrics, add neural vectors in an isolated worker, and consolidate episodes every six completed exchanges when the local model is ready.

## Privacy controls

The Settings memory panel can inspect and edit confirmed facts, approve/reject candidates, inspect or delete episodes and conversation history, export local personal data, and reset everything. Full reset removes approved and pending facts, transcript records, episodes, vector rows, relationship counters and old JSON memory records, then truncates SQLite WAL and vacuums. Cached model **weights** are not personal data and are retained.

Only user text is eligible for candidate extraction; screen observation results and untrusted web pages are not silently promoted into memories. Model-generated facts must also be reviewed. Episodic summaries are fallible; users can inspect or delete them.

## Semantic embeddings

Semantic similarity uses \`Xenova/all-MiniLM-L6-v2\` through local Transformers.js/ONNX, Apache-2.0 licensed. This model is **not** the language model. The first installation of embedding weights requires explicit user approval; once cached, embeddings run offline. Without an installed embedding model, FTS5 lexical retrieval continues to work. The vector layer is a bounded local cosine scan (suitable for a personal memory database); large-scale approximate-nearest-neighbor indexing is not yet integrated.

## Unity / avatar interface

\`protocol.cjs\` defines a versioned JSON command and event contract. Examples include \`conversation.prepare\`, \`memory.search\`, \`memory.approve\`, \`assistant.delta\`, \`avatar.talk.start\`, and \`avatar.emotion\`. The Electron IPC interface currently hosts the running AI and memory system. An authenticated named-pipe adapter for a separate Unity player process is **not yet implemented**; do not expose a TCP port or call this an established Unity-to-AI transport. The current Unity avatar/animation scenes are unchanged by this core.

## Steam commercial release gates

- Choose and pin a compatible GGUF checkpoint, quantization, tokenizer/chat template and redistribution license. A candidate to evaluate is [Qwen3-4B-Instruct-2507](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507), marked Apache-2.0; quantized conversions must be separately verified. This is not a model currently bundled by the repo.
- Bundle a known-good llama.cpp Windows build (MIT) with its DLLs, exact license notices and platform-specific CPU/GPU backends. Validate x64, Windows hardware, offline launch and updates. No unapproved background model download.
- Bundle or provide user-approved offline access to the embedding model (Apache-2.0) and voice model with their notices, tokenizer and ONNX runtime licenses. Test on CPU-only and moderate GPU PCs.
- **Resolve third-party asset rights before commercial release.** The previously uploaded Mya VRM had metadata restrictions on commercial use/redistribution; do not distribute it without permission. Review Unity and Asset Store licenses, not just language-model licenses.
- Build a security/privacy threat model: encrypted storage options, OS-level file ACLs, export safeguards, secure updates, telemetry policy, Steam Cloud opt-in handling, and GDPR/US privacy deletion requirements where applicable.
- Execute Windows/Electron end-to-end tests with real model weights, voice input/output, GPU, avatar animation, full reset, database migration and crash recovery. CI unit tests alone are not release validation.
