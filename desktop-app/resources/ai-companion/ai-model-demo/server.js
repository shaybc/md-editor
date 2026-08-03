/**
 * Standalone OpenAI-compatible demo model server for local AI Companion testing.
 */

"use strict";

const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const DEFAULT_PORT = 11434;
const PORT = Number(process.env.AI_MODEL_DEMO_PORT || DEFAULT_PORT);
const HOST = process.env.AI_MODEL_DEMO_HOST || "127.0.0.1";
const STUBS_DIR = path.join(__dirname, "stubs");

const ENDPOINT_STUBS = new Map([
  ["/v1/models", "models.txt"],
  ["/v1/completions", "completions.txt"],
  ["/v1/chat/completions", "chat-completions.txt"],
  ["/v1/embeddings", "embeddings.txt"]
]);
/**
 * Choose the chat-completions stub that best fits the request mode.
 * @param {Record<string, unknown>} requestJson - Parsed chat-completions request.
 * @returns {string} Stub file name to read.
 */
function getChatCompletionsStubName(requestJson) {
  const messages = getChatMessages(requestJson);
  const promptText = messages.map((message) => String(message?.content || "")).join("\n");
  if (/Return only the exact code or prose that should be inserted at the cursor/i.test(promptText)) return "chat-completions-autocomplete.txt";
  if (isAgentToolRequest(requestJson) && !messages.some((message) => message.role === "tool")) return "chat-completions-agent-list-files.txt";
  if (isAgentToolRequest(requestJson) && !getReadFileToolResult(messages)) return "chat-completions-agent-read-file.txt";
  if (isAgentFinalAnswerRequest(requestJson)) return "chat-completions-agent-final.txt";
  return "chat-completions.txt";
}

/**
 * Get normalized chat messages from an OpenAI-compatible request.
 * @param {Record<string, unknown>} requestJson - Parsed request object.
 * @returns {Array<Record<string, unknown>>} Message list.
 */
function getChatMessages(requestJson) {
  return Array.isArray(requestJson.messages) ? requestJson.messages : [];
}

/**
 * Determine whether the request is asking the model to drive workspace tools.
 * @param {Record<string, unknown>} requestJson - Parsed request object.
 * @returns {boolean} True when tool definitions are present.
 */
function isAgentToolRequest(requestJson) {
  return Array.isArray(requestJson.tools) && requestJson.tools.some((tool) => tool?.function?.name === "read_file" || tool?.function?.name === "list_files");
}

/**
 * Determine whether the request is the streamed final agent answer pass.
 * @param {Record<string, unknown>} requestJson - Parsed request object.
 * @returns {boolean} True when the final answer prompt is present.
 */
function isAgentFinalAnswerRequest(requestJson) {
  const messages = getChatMessages(requestJson);
  return requestJson.stream === true && messages.some((message) => /Provide the final answer using the inspected workspace context/i.test(String(message?.content || "")));
}

/**
 * Parse a tool message result without letting malformed demo input fail routing.
 * @param {unknown} content - Tool message content.
 * @returns {unknown} Parsed tool result or null.
 */
function parseToolResult(content) {
  try {
    return JSON.parse(String(content || "null"));
  } catch (_error) {
    return null;
  }
}

/**
 * Find the read_file tool result from previous agent steps.
 * @param {Array<Record<string, unknown>>} messages - Chat message list.
 * @returns {{ path: string, content: string } | null} Read file result.
 */
function getReadFileToolResult(messages) {
  for (const message of messages) {
    if (message.role !== "tool") continue;
    const result = parseToolResult(message.content);
    if (result && typeof result === "object" && !Array.isArray(result) && typeof result.content === "string") {
      return { path: String(result.path || ""), content: result.content };
    }
  }
  return null;
}

/**
 * Choose README.md from list_files results, falling back to the last listed file.
 * @param {Array<Record<string, unknown>>} messages - Chat message list.
 * @returns {string} Workspace-relative file path.
 */
function chooseReadFilePath(messages) {
  for (const message of messages) {
    if (message.role !== "tool") continue;
    const result = parseToolResult(message.content);
    if (!Array.isArray(result)) continue;
    const files = result.map((file) => String(file || "")).filter(Boolean);
    return files.find((file) => /(^|\/)README\.md$/i.test(file)) || files[files.length - 1] || "README.md";
  }
  return "README.md";
}

/**
 * Escape replacement text for insertion inside a JSON string value.
 * @param {string} value - Raw replacement value.
 * @returns {string} JSON-string-safe content.
 */
function escapeJsonStringContent(value) {
  return JSON.stringify(String(value || "")).slice(1, -1);
}

/**
 * Fill dynamic demo placeholders in chat-completions stubs.
 * @param {string} content - Raw stub content.
 * @param {Record<string, string>} replacements - Placeholder replacement map.
 * @returns {string} Stub content with JSON-safe replacements.
 */
function fillStubPlaceholders(content, replacements) {
  let nextContent = content;
  for (const [placeholder, value] of Object.entries(replacements)) {
    nextContent = nextContent.split(placeholder).join(escapeJsonStringContent(value));
  }
  return nextContent;
}

/**
 * Read a request body as text for endpoint behavior decisions.
 * @param {import("node:http").IncomingMessage} request - Incoming HTTP request.
 * @returns {Promise<string>} Raw request body text.
 */
function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

/**
 * Parse request JSON without failing the demo server for malformed bodies.
 * @param {string} body - Raw request body text.
 * @returns {Record<string, unknown>} Parsed request object or an empty object.
 */
function parseRequestJson(body) {
  if (!body.trim()) return {};
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
}

/**
 * Resolve and read a stub file for a supported endpoint.
 * @param {string} fileName - Stub file name from ENDPOINT_STUBS.
 * @returns {Promise<string>} Stub file contents.
 */
async function readStub(fileName) {
  return fs.readFile(path.join(STUBS_DIR, fileName), "utf8");
}

/**
 * Attach headers shared by all demo responses.
 * @param {import("node:http").ServerResponse} response - HTTP response object.
 */
function writeCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

/**
 * Print one concise line for every request that reaches the demo server.
 * @param {import("node:http").IncomingMessage} request - HTTP request object.
 * @param {string} endpoint - Normalized endpoint path.
 */
function logRequest(request, endpoint) {
  console.log(`[${new Date().toISOString()}] ${request.method || "GET"} ${endpoint}`);
}

/**
 * Send a plain JSON stub response exactly as stored on disk.
 * @param {import("node:http").ServerResponse} response - HTTP response object.
 * @param {string} content - Stub JSON content.
 */
function sendStubJson(response, content) {
  writeCorsHeaders(response);
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  response.end(content);
}

/**
 * Extract assistant text from the chat-completions stub for streaming mode.
 * @param {string} stubContent - Raw chat-completions JSON stub content.
 * @returns {{ id: string, model: string, content: string }} Stream metadata.
 */
function readChatStreamContent(stubContent) {
  const parsed = JSON.parse(stubContent);
  return {
    id: String(parsed.id || "chatcmpl-demo-stream"),
    model: String(parsed.model || "demo-model"),
    content: String(parsed?.choices?.[0]?.message?.content || "")
  };
}

/**
 * Send OpenAI-style server-sent events using the chat-completions stub text.
 * @param {import("node:http").ServerResponse} response - HTTP response object.
 * @param {string} stubContent - Raw chat-completions JSON stub content.
 */
function sendChatStream(response, stubContent) {
  const stream = readChatStreamContent(stubContent);
  const created = Math.floor(Date.now() / 1000);
  const chunks = stream.content.match(/.{1,24}/g) || [""];

  writeCorsHeaders(response);
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });

  for (const chunk of chunks) {
    response.write(`data: ${JSON.stringify({
      id: stream.id,
      object: "chat.completion.chunk",
      created,
      model: stream.model,
      choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }]
    })}\n\n`);
  }

  response.write(`data: ${JSON.stringify({
    id: stream.id,
    object: "chat.completion.chunk",
    created,
    model: stream.model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
  })}\n\n`);
  response.end("data: [DONE]\n\n");
}

/**
 * Send a JSON error response for unsupported demo-server requests.
 * @param {import("node:http").ServerResponse} response - HTTP response object.
 * @param {number} status - HTTP status code.
 * @param {string} message - Error message.
 */
function sendError(response, status, message) {
  writeCorsHeaders(response);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: { message } }, null, 2));
}

/**
 * Route one OpenAI-compatible demo request.
 * @param {import("node:http").IncomingMessage} request - HTTP request object.
 * @param {import("node:http").ServerResponse} response - HTTP response object.
 */
async function handleRequest(request, response) {
  writeCorsHeaders(response);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const endpoint = url.pathname.replace(/\/+$/, "") || "/";
  logRequest(request, endpoint);
  const stubName = ENDPOINT_STUBS.get(endpoint);
  if (!stubName) {
    sendError(response, 404, `Unsupported demo endpoint: ${endpoint}`);
    return;
  }

  if (endpoint === "/v1/models" && request.method !== "GET") {
    sendError(response, 405, "/v1/models supports GET in this demo server.");
    return;
  }
  if (endpoint !== "/v1/models" && request.method !== "POST") {
    sendError(response, 405, `${endpoint} supports POST in this demo server.`);
    return;
  }

  const body = request.method === "POST" ? await readRequestBody(request) : "";
  const requestJson = parseRequestJson(body);
  const responseStubName = endpoint === "/v1/chat/completions" ? getChatCompletionsStubName(requestJson) : stubName;
  let stubContent = await readStub(responseStubName);
  if (endpoint === "/v1/chat/completions") {
    const messages = getChatMessages(requestJson);
    const readFileResult = getReadFileToolResult(messages);
    stubContent = fillStubPlaceholders(stubContent, {
      "__AI_DEMO_READ_PATH__": chooseReadFilePath(messages),
      "__AI_DEMO_FILE_PATH__": readFileResult?.path || "README.md",
      "__AI_DEMO_FILE_CONTENT__": readFileResult?.content || "No file content was read yet."
    });
  }

  if (endpoint === "/v1/chat/completions" && requestJson.stream === true) {
    sendChatStream(response, stubContent);
    return;
  }

  sendStubJson(response, stubContent);
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    sendError(response, 500, error?.message || String(error));
  });
});

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the existing demo server process, then start this server again.`);
    process.exitCode = 1;
    return;
  }
  console.error(error?.message || String(error));
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`AI model demo server listening at http://${HOST}:${PORT}/v1`);
  console.log(`Serving OpenAI-compatible stubs from ${STUBS_DIR}`);
  console.log(`Use AI Companion Base URL: http://${HOST}:${PORT}/v1`);
});
