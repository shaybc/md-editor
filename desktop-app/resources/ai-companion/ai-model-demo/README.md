---
tags: []
---
# AI Model Demo Server

Standalone OpenAI-compatible stub server for testing md-editor's AI Companion.
It does not modify or integrate with md-editor runtime files.

## Run

```powershell
node tools\ai-model-demo\server.js
```

The server listens on `http://127.0.0.1:11434/v1` by default. Override the port
with `AI_MODEL_DEMO_PORT` if needed.

## Endpoints

- `GET /v1/models` reads `stubs/models.txt`
- `POST /v1/completions` reads `stubs/completions.txt`
- `POST /v1/chat/completions` reads `stubs/chat-completions.txt`
- `POST /v1/embeddings` reads `stubs/embeddings.txt`

Normal responses return the stub file content as JSON. Chat completion requests
with `"stream": true` use `chat-completions.txt` to emit OpenAI-style SSE chunks
so the AI Companion streaming UI can be tested.

## AI Companion Settings

Use these values in the AI Companion settings panel:

- Connection mode: `OpenAI-compatible endpoint`
- Base URL: `http://127.0.0.1:11434/v1`
- Model: `llama3.1`
- API key/token: leave empty

The server prints one line for every request it receives. If the console shows
no request line after using **Test connection**, the desktop app did not reach
the demo server.
