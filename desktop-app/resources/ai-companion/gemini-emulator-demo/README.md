---
tags: []
---
# Gemini Emulator Demo

Standalone Gemini Connector emulator for local testing.

## Run

```bash
npm start
```

or:

```bash
node server.js
```

The server listens on `http://localhost:3999` by default. To use another port:

```bash
PORT=4000 npm start
```

On PowerShell:

```powershell
$env:PORT = "4000"; npm start
```

## Demo configuration

Use these values in the app's Gemini Connector settings:

```text
Base URL: http://localhost:3999
Connector ID: abc123
API key: mykey
Model: gemini-2.5-flash
Mode: regular
```

Available connector IDs:

- `abc123` returns the simple text-only connector shape.
- `full-01` returns the wrapped Gemini response shape.
- `override-01` logs supported LLM override parameters.

Available API keys:

- `mykey`
- `test-api-key-123`

## Raw Gemini mode

The emulator also accepts raw Gemini-style requests:

```text
POST /api/connectors/:connectorId/v1beta/models/:model:generateContent
```

For raw mode in the app, use the same base URL, connector ID, API key, and model, then set mode to `raw`.

## Quick curl check

```bash
curl -X POST http://localhost:3999/api/connectors/abc123 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mykey" \
  -d "{\"text\":\"hello from the standalone emulator\"}"
```
