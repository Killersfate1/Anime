# Mya Local AI — portable runtime files (not committed)

This directory is intentionally empty in GitHub. Place the official llama.cpp `llama-server.exe` Windows executable and its accompanying DLLs here, and create a `models/` directory containing a compatible instruction-tuned GGUF, for example `models/mya.gguf`.

Mya automatically discovers and starts her own local inference engine when these files are present. The application intentionally exposes no external AI-service connection or model-selection screen.

**Important:** llama.cpp is an open-source inference runtime; compatible model weights are separately licensed. Their licenses must be reviewed before redistributing or selling Mya. These binaries/models are not uploaded or downloaded automatically by the app.

- Official llama.cpp Windows releases: https://github.com/ggml-org/llama.cpp/releases
- Search GGUF models: https://huggingface.co/models?library=gguf

Multimodal vision requires a compatible model and matching projector GGUF configured by the developer during packaging. A plain text model needs only its GGUF. On Windows, CPU inference may be slower; choose a small quantized GGUF appropriate for the target PC's RAM and VRAM.
