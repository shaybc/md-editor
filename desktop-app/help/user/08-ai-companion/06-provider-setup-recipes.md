---
tags: []
---
# 8.6. AI Provider Setup Recipes

This page gives practical setup values for common AI Companion providers. Use it after you open <kbd>Actions</kbd> -> <kbd>Settings...</kbd> -> <kbd>AI</kbd>.

AI Companion always needs three decisions:

- Turn on <kbd>Enable AI Companion</kbd>.
- Choose the <kbd>Connection provider</kbd> that matches your endpoint.
- For a bundled provider, review the filled URL and model, then enter its credential. You can choose a suggested model or type another model id.

> Tip: Start with <kbd>Chat mode</kbd> only. Send a small test prompt such as "Reply with exactly: hello." After that works, enable Agent, Autocomplete, or Git summary.

## Quick Comparison

| Supplier | Connection Provider | Base URL Or Connector URL | Token Field | Model Example |
| --- | --- | --- | --- | --- |
| Google Connector | Gemini Connector or Gemini Connector Raw | Your connector service URL | Gemini connector token | `gemini-3.5-flash` |
| Google Gemini API key | Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | API key/token | `gemini-3.6-flash` |
| OpenAI | OpenAI | `https://api.openai.com/v1` | API key/token | `gpt-5.5` |
| Anthropic | Anthropic Claude | `https://api.anthropic.com/v1` | API key/token | `claude-sonnet-5` |
| xAI | xAI Grok | `https://api.x.ai/v1` | API key/token | `grok-4.5` |
| Ollama | Ollama | `http://localhost:11434/v1` | Usually blank | `qwen3.5` |
| Other local LLM | OpenAI-compatible endpoint | The server's OpenAI-compatible base URL | Usually blank | The model id exposed by the server |
| LiteLLM | LiteLLM proxy | Your LiteLLM proxy URL | API key/token, if the proxy requires one | A LiteLLM alias such as `default` |

Use the Base URL value only. AI Companion adds `/chat/completions` when it calls OpenAI-compatible providers.

## Google Connector

Use this when your organization provides a Gemini Connector service instead of giving the desktop app a direct Google AI Studio key.

Set:

| Setting | Value |
| --- | --- |
| Connection provider | <kbd>Gemini Connector</kbd> |
| Gemini connector URL | Your connector service root, for example `https://connector.example.com` |
| Gemini connector ID | The connector id provided by your service owner |
| Gemini connector token | The bearer token provided by your service owner, if required |
| Model | The Gemini model served by the connector, for example `gemini-3.5-flash` |

Use <kbd>Gemini Connector Raw</kbd> only when the connector expects the raw Gemini `generateContent` path. In raw mode, AI Companion calls `/api/connectors/{connectorId}/v1beta/models/{model}:generateContent` on the connector service.

Leave the normal <kbd>Base URL</kbd> and <kbd>API key/token</kbd> fields unused for this mode unless your connector administrator tells you otherwise.

## Google Gemini

Use this when you have a Gemini API key from Google AI Studio and want to call Gemini through Google's OpenAI-compatible endpoint.

Set:

| Setting | Value |
| --- | --- |
| Connection provider | <kbd>Google Gemini</kbd> |
| Base URL | `https://generativelanguage.googleapis.com/v1beta/openai` |
| API key/token | Your Gemini API key from Google AI Studio |
| Model | Choose a bundled Gemini model such as `gemini-3.6-flash`, or type another model enabled for your key |
| Request delay | The bundled preset uses 4500 ms to stay below a 15 requests-per-minute free-tier quota. Adjust it to match the active limit shown in Google AI Studio. |

Do not choose <kbd>Gemini Connector</kbd> for a direct Google AI Studio key. Connector mode is for a separate connector service with a connector URL and connector ID.

When Gemini returns HTTP 429, AI Companion honors `Retry-After`, structured `RetryInfo`, or a retry delay in the provider message, then adds a small safety buffer. If the response exposes a requests-per-minute quota, AI Companion also raises pacing for the current provider session without overwriting the saved setting.

## OpenAI

Use this when you have an OpenAI API key.

Set:

| Setting | Value |
| --- | --- |
| Connection provider | <kbd>OpenAI</kbd> |
| Base URL | `https://api.openai.com/v1` |
| API key/token | Your OpenAI API key |
| Model | `gpt-5.5`, or another model available to your OpenAI account |

If the provider returns an unsupported-parameter error, AI Companion can retry some OpenAI-compatible requests with safer parameters. If the model still rejects the request, choose a model that supports chat completions and tool calling for Chat and Agent workflows.

## Anthropic

Use this when you have an Anthropic API key and want to call Claude through Anthropic's OpenAI compatibility layer. This compatibility path supports the shared AI Companion chat-completions flow, but it does not expose every native Claude Messages API feature.

Set:

| Setting | Value |
| --- | --- |
| Connection provider | <kbd>Anthropic Claude</kbd> |
| Base URL | `https://api.anthropic.com/v1` |
| API key/token | Your Anthropic API key |
| Model | Choose a bundled Claude model such as `claude-sonnet-5`, or type another supported model id |

Use LiteLLM instead when your team needs gateway-managed credentials, routing, or native-provider translation.

## xAI Grok

Select <kbd>xAI Grok</kbd>, enter your xAI API key, and choose `grok-4.5` from the model dropdown. The preset fills `https://api.x.ai/v1`; the base URL and model remain editable for future compatible endpoints and models.

## Local LLM

Use this for open-source models served by local tools such as Ollama, LM Studio, vLLM, or llama.cpp servers that expose OpenAI-compatible endpoints.

Common values:

| Server | Connection Provider | Base URL | API key/token | Model Example |
| --- | --- | --- | --- | --- |
| Ollama | Ollama | `http://localhost:11434/v1` | Leave blank unless configured | `qwen3.5` |
| LM Studio | OpenAI-compatible endpoint | `http://localhost:1234/v1` | Leave blank unless configured | The model id shown by LM Studio |
| vLLM | OpenAI-compatible endpoint | `http://localhost:8000/v1` | Leave blank unless configured | The served model name |

Local models vary in speed and tool support. For large folders, start with Chat mode, reduce output limits if responses are slow, and enable Agent mode only after the local server handles normal chat reliably.

The Ollama preset does not download models. Pull the selected model before testing the connection, or type the id of a model already available on your Ollama server.

For Autocomplete, set the model family when auto-detection is wrong. Instruct models usually work with <kbd>Instruct / chat</kbd>; fill-in-the-middle code models can use the StarCoder, DeepSeek Coder, Code Llama, or CodeGemma families.

## LiteLLM

Use this when a LiteLLM proxy owns routing, credentials, budgets, logging, fallback behavior, or access to providers that AI Companion does not call directly.

Set:

| Setting | Value |
| --- | --- |
| Connection provider | <kbd>LiteLLM proxy</kbd> |
| Base URL | Your LiteLLM proxy URL, for example `http://localhost:4000` |
| API key/token | The LiteLLM virtual key or proxy key, if required |
| LiteLLM model alias | The proxy alias to call, for example `default`, `gpt`, `claude`, or `local-coder` |
| LiteLLM routing config | Optional JSON object sent with the request body |

Use LiteLLM when the desktop app should not store provider-specific keys, when a team wants the same model alias on every machine, or when you need one endpoint that can route between OpenAI, Anthropic, Google, local models, and other suppliers.

## Troubleshooting

| Symptom | Likely Cause | What To Do |
| --- | --- | --- |
| Provider returns 404 for `/chat/completions` | The Base URL includes the full endpoint or the server is not OpenAI-compatible. | Enter only the base path, such as `https://api.openai.com/v1` or `http://localhost:11434/v1`. |
| Gemini API key does not work in connector mode | Direct Gemini keys and connector tokens are different setup paths. | Use <kbd>Google Gemini</kbd> for a Google AI Studio key. |
| Local model does not answer | The local server is stopped, the model is not loaded, or the model name is wrong. | Start the server, load the model, and copy the exact model id from that server. |
| LiteLLM answers with the wrong model | The alias points to a different route in the proxy. | Update the LiteLLM proxy config or use the correct <kbd>LiteLLM model alias</kbd>. |
| Agent mode fails when Chat works | The model or gateway does not support tool calling. | Use a model and provider route that supports OpenAI-style tool calls, or keep that provider for Chat only. |
| Debug logs expose too much detail | Full provider payload logging is enabled. | Turn off full AI provider logs after troubleshooting. |

Previous: [8.5. Git Summary And Integrations](05-git-summary-and-integrations.md)  
Back to: [8. AI Companion](index.md)
