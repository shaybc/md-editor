---
tags: []
---
# API Client

The API Client is a desktop request workspace inside MD-Editor. It works like a focused Postman-style client for documentation work: create saved requests, organize them in folders, edit method, URL, params, headers, body, and form data, send requests, inspect responses, reuse environments, and keep request evidence near your Markdown notes.

Open it from <kbd>Actions</kbd> -> <kbd>Tools</kbd> -> <kbd>API Client</kbd>.

![API Client request workspace](../img/api-client.png)

## Main Areas

The API Client uses two app areas:

- The API Client sidebar for saved requests, recent history, environments, import, and export.
- The API Client tab for editing, sending, saving, and inspecting one request.

The sidebar has three tabs:

| Tab | Use It For |
| --- | --- |
| Saved | Organize request folders and saved requests. |
| History | Reopen recently sent requests and their response snapshots. |
| Environments | Manage environments, globals, and secret variables. |

## Create A Saved Request

Use saved requests when an endpoint should be reusable.

1. Open <kbd>Actions</kbd> -> <kbd>Tools</kbd> -> <kbd>API Client</kbd>.
2. In the API Client sidebar, open the <kbd>Saved</kbd> tab.
3. Optional: create a folder for related requests.
4. Click the request `+` action on a folder or on the root area.
5. Enter a request name.
6. The request opens in an API Client tab.
7. Choose the method, enter the URL, and edit params, headers, body, or form data.
8. Click <kbd>Save</kbd> or press <kbd>Ctrl</kbd>+<kbd>S</kbd>.

Double-click a saved request to open it. If the same saved request is already open, MD-Editor focuses the existing tab.

Use <kbd>Ctrl</kbd>+click (or <kbd>Cmd</kbd>+click on macOS) to toggle multiple saved requests and folders, or <kbd>Shift</kbd>+click to select a visible range. Deleting a selected item deletes the complete selection, and dragging any selected item moves the selected requests and folders together.

## Edit And Send A Request

In the request tab:

1. Choose the HTTP method.
2. Enter the request URL.
3. Select an environment if the URL, params, headers, body, or form data use variables.
4. Use the request tabs:
   - <kbd>Params</kbd> for query string values.
   - <kbd>Headers</kbd> for request headers.
   - <kbd>Body</kbd> for raw body or form data when the method supports a body.
5. Click <kbd>Send</kbd>.

While a request is running, <kbd>Send</kbd> changes to <kbd>Cancel</kbd>. When the request finishes, the response appears in the lower section.

`GET` and `HEAD` requests do not send a body.

## Request Details

The URL and params stay synchronized. Query string values in the URL appear in the <kbd>Params</kbd> tab, and enabled param rows are applied back to the URL.

The <kbd>Headers</kbd> tab accepts enabled key/value rows or raw edit mode. Headers generated from settings, such as no-cache headers or cookie jar headers, are applied when the request is sent.

The <kbd>Body</kbd> tab supports the body modes available in the request editor. Body input is disabled for methods that do not send a body.

Use the cookie button to manage cookies stored in the current MD-Editor profile. These cookies are applied only to API Client requests when the cookie jar setting is enabled.

Use the code button to generate a snippet from the current request. Available snippet targets include cURL, wget, JavaScript Fetch, JavaScript XHR, Kotlin OkHttp, Node.js Request, PowerShell RestMethod, Python Requests, Swift URLSession, and C# HttpClient.

## Inspect The Response

The response section shows status, timing, response size, response body, cookies, headers, and a console view of the raw request/response exchange.

Response tabs:

| Tab | Use It For |
| --- | --- |
| Body | Read the response body in preview or raw mode. |
| Cookies | Inspect cookies returned by the response. |
| Headers | Inspect or copy response headers. |
| Console | Review the raw request sent, raw response returned, redirects, and low-level errors. |

Use <kbd>Preview</kbd> for formatted or rendered output, and <kbd>Raw</kbd> for the exact response body text. Preview render modes include Auto, JSON, Text, HTML, XML, and Binary.

The body copy button copies the currently visible body content. The headers copy button copies raw response headers.

## Save, Save As, And History

Use <kbd>Save</kbd> to update the opened saved request.

Use the save dropdown and choose <kbd>Save As</kbd> to store the current request under a different name.

Recent history is stored separately from saved requests. History entries include the request snapshot and response snapshot. Double-click a history entry to reopen it in an API Client tab. Use <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+click or <kbd>Shift</kbd>+click to select multiple entries, then use the delete button beside the History label to delete them together. Clear history remains available when the complete list is no longer useful.

## Import And Export

The Saved sidebar can import and export Postman collection JSON.

Use import when you want to bring existing request collections into MD-Editor. Use export when you want to share saved API Client requests with tools that understand Postman collection format.

Export can include selected saved requests or folders. Imported requests are added to the saved request tree.

## Environments And Variables

Environments let you reuse values across requests. They are useful for base URLs, API keys, tokens, tenant IDs, user IDs, and values that change between local, QA, staging, and production targets.

Environment variables use this syntax:

```text
{{variableName}}
```

Variables are resolved only when you click <kbd>Send</kbd>. Saved requests and recent history keep the original unresolved request text.

| Concept | Meaning |
| --- | --- |
| Environment | A named set of variables, such as `Local`, `QA`, or `Production`. |
| Active environment | The environment selected in the request tab toolbar. |
| Globals | Variables available even when no environment is selected. |
| Secret | A variable type that masks the current value by default. |
| Initial value | A fallback value. |
| Current value | The preferred runtime value used when sending. |

Variable precedence is:

1. Active environment current value.
2. Active environment initial value.
3. Global current value.
4. Global initial value.

If a variable is missing or has no value, the request is blocked with an unresolved-variable error.

## Tutorial: API Client Environments

This tutorial creates one saved request that calls NASA's Astronomy Picture of the Day endpoint with NASA's public test key.

The example API key is:

```text
DEMO_KEY
```

### Create The Saved Request

1. Open <kbd>Actions</kbd> -> <kbd>Tools</kbd> -> <kbd>API Client</kbd>.
2. In the API Client sidebar, open the <kbd>Saved</kbd> tab.
3. Optional: create a folder named `NASA Test`.
4. Click the request `+` action on the folder or root area.
5. Name the request `NASA APOD`.
6. Keep the opened request tab active.

### Create The Environment

1. In the API Client sidebar, open the <kbd>Environments</kbd> tab.
2. Click the `+` action for environments.
3. Name the environment `NASA Test`.
4. Select `NASA Test` in the environment list.

### Add Environment Variables

Add the base URL:

| Field | Value |
| --- | --- |
| Variable | `baseUrl` |
| Type | `Default` |
| Initial value | `https://api.nasa.gov` |
| Current value | `https://api.nasa.gov` |

Then add the API key as a secret:

| Field | Value |
| --- | --- |
| Variable | `nasaApiKey` |
| Type | `Secret` |
| Initial value | `DEMO_KEY` |
| Current value | `DEMO_KEY` |

The secret current value is masked by default.

### Configure The Request

In the opened `NASA APOD` request tab:

1. Select the `NASA Test` environment from the environment dropdown.
2. Set the method to `GET`.
3. Enter this URL:

```text
{{baseUrl}}/planetary/apod?api_key={{nasaApiKey}}
```

4. Leave headers empty.
5. Leave the body empty.
6. Click <kbd>Save</kbd>.

The saved request keeps the variable names instead of storing the resolved URL.

### Send The Request

Click <kbd>Send</kbd>. For this send, the API Client resolves the URL to:

```text
https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY
```

The response should appear as JSON. APOD response content changes by date, but common fields include `date`, `title`, `media_type`, `service_version`, and `url`.

### Reuse The Variables

Create more NASA requests by reusing:

```text
{{baseUrl}}
{{nasaApiKey}}
```

For example:

```text
{{baseUrl}}/planetary/apod?api_key={{nasaApiKey}}&date=2024-01-01
```

Saved requests keep variable names. Secret values are resolved only when sending.

## API Client Settings

Open <kbd>Actions</kbd> -> <kbd>Settings...</kbd>, then use the API Client settings area.

![API Client settings](../img/settings-api-client.png)

Important settings include:

- Recent history limit.
- Automatic redirect following, maximum redirects, and redirect method behavior.
- Redirect authorization and custom-header policies.
- Request timeout.
- SSL certificate verification.
- Cookie jar behavior.
- No-cache header behavior.
- Maximum response size.
- Response render mode.
- Response decompression.
- Proxy mode and custom HTTP proxy URL.
- HTTP version preference.

Business benefit: API settings let request testing match your environment. A local service, a corporate proxy, a strict TLS endpoint, and a large JSON API often need different timeout, proxy, redirect, certificate, cookie, and response-size behavior.

## AI Companion Integration

When AI Companion tools are enabled, the assistant can work with API Client data through approved tools. It can search saved requests, create or update saved requests, send saved or inline requests, read recent history, analyze responses, and read or update environments with secret values masked.

This does not replace the API Client UI. It gives the assistant a controlled way to help prepare requests, inspect failures, and reuse the same saved request data you manage manually.

Example prompts:

- `Search my API Client saved requests for anything related to authentication, then summarize what endpoints I already have.`
- `Create a saved GET request named Health Check in the Local API folder for {{baseUrl}}/health using the Local environment.`
- `Send the saved Health Check request and explain the response status, headers, and body in plain language.`
- `Create a QA environment with baseUrl, tenantId, and apiToken variables. Make apiToken a secret.`
- `Update the saved Create User request to use {{baseUrl}} and {{apiToken}} instead of hardcoded values.`
- `Look at my latest API Client history entry and tell me the likely reason it failed.`
- `Build a new saved POST request for creating a user from this API documentation, but ask before sending it.`
- `Compare the Local and QA environments and list variables that are missing or named differently.`
Previous: [5. Tools](05-tools.md)  
Next: [6. Settings And Data](06-settings-and-data.md)
