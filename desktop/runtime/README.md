# Mya Local AI — portable runtime files (not committed)

This directory is intentionally empty in GitHub. Place the official llama.cpp `llama-server.exe` Windows executable and its accompanying DLLs here, and create a `models/` directory containing a compatible instruction-tuned GGUF, for example `models/mya.gguf`.

Mya will auto-discover the engine and GGUF if there is exactly one valid GGUF in `models/`. You can also select files from any folder inside the application's **Settings → Mya Local AI Engine** panel.

**Important:** llama.cpp is an open-source inference runtime; compatible model weights are separately licensed. Their licenses must be reviewed before redistributing or selling Mya. These binaries/models are not uploaded or downloaded automatically by the app.

- Official llama.cpp Windows releases: https://github.com/ggml-org/llama.cpp/releases
- Search GGUF models: https://huggingface.co/models?library=gguf

For vision-capable models, select a matching multimodal projector GGUF (`mmproj`) in Settings. A plain text model needs only its GGUF. On Windows, CPU mode (`GPU layers = 0`) is the safest first test, but it may be slower. A smaller quantized GGUF is more appropriate for computers with limited RAM/VRAM.
