import http from "http";
import util from "util";

const PORT = Number(process.env.PORT || 3999);

const VALID_KEYS = ["mykey", "test-api-key-123"];

const CONNECTORS = {
  "abc123": {
    name: "My Connector",
    responseFormat: "text-only",
    llmOverride: false
  },
  "full-01": {
    name: "Full Response Connector",
    responseFormat: "gemini-full",
    llmOverride: false
  },
  "override-01": {
    name: "Override Connector",
    responseFormat: "text-only",
    llmOverride: true
  }
};

function stubAnswer(prompt = "", files = []) {
  if (files.length > 0) {
    return `Stub: received ${files.length} file(s) (${files.map((file) => file.mimeType).join(", ")}). In production the model would analyse them.`;
  }
  return `Stub response to: "${prompt.slice(0, 80)}". The connector is working correctly.`;
}

function textOnlyResponse(connectorId, connector, answer) {
  return {
    success: true,
    message: "OK Success",
    request: { connectorId, connectorName: connector.name },
    response: answer
  };
}

function geminiFullResponse(connectorId, connector, answer) {
  return {
    success: true,
    message: "OK Success",
    request: { connectorId, connectorName: connector.name },
    response: geminiGenerateContentResponse(answer)
  };
}

function geminiGenerateContentResponse(answer) {
  return {
    candidates: [{
      content: { role: "model", parts: [{ text: answer }] },
      finishReason: "STOP",
      safetyRatings: []
    }],
    usageMetadata: {
      promptTokenCount: 42,
      candidatesTokenCount: 18,
      totalTokenCount: 60
    }
  };
}

function promptFromGeminiBody(body) {
  const textParts = [];

  if (Array.isArray(body?.systemInstruction?.parts)) {
    textParts.push(...body.systemInstruction.parts.map((part) => part?.text).filter(Boolean));
  }

  if (Array.isArray(body?.contents)) {
    for (const content of body.contents) {
      const parts = Array.isArray(content?.parts) ? content.parts : [];
      textParts.push(...parts.map((part) => part?.text).filter(Boolean));
    }
  }

  return textParts.join("\n\n");
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    return send(res, 204);
  }

  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString();

    let body = {};
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        return send(res, 400, { error: "Invalid request body" });
      }
    }

    handle(req, res, body);
  });
});

function handle(req, res, body) {
  const { method, url } = req;

  console.log("\n--- Incoming Request ---");
  console.log(`${method} ${url}`);
  console.log("Headers:\n", req.headers);
  console.log("Body:\n", util.inspect(body, { depth: null, colors: true, maxStringLength: Infinity }));

  const match = url.match(/^\/api\/connectors\/([^/?]+)(?:\/v1beta\/models\/([^/?]+):generateContent)?(?:\?.*)?$/);
  if (!match || method !== "POST") {
    return send(res, 404, { error: `Not found: ${method} ${url}` });
  }

  const connectorId = decodeURIComponent(match[1]);
  const rawModel = match[2] ? decodeURIComponent(match[2]) : "";

  const authHeader = req.headers.authorization || "";
  const key = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : authHeader.trim();
  if (!key) return send(res, 401, { error: "API key is required" });
  if (!VALID_KEYS.includes(key)) return send(res, 401, { error: "Invalid API key" });

  const connector = CONNECTORS[connectorId];
  if (!connector) return send(res, 404, { error: "Connector not found or disabled" });

  const isRawGeminiRequest = Boolean(rawModel);
  const prompt = isRawGeminiRequest ? promptFromGeminiBody(body) : body.text;

  if (!prompt) return send(res, 400, { error: "Invalid request body - prompt text is required" });

  const overrideKeys = ["temperature", "topP", "topK", "maxOutputTokens"];
  if (connector.llmOverride) {
    const applied = Object.fromEntries(overrideKeys.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
    console.log(`[connector:${connectorId}] LLM overrides applied:`, applied);
  }

  const files = Array.isArray(body.files) ? body.files : [];
  const answer = stubAnswer(prompt, files);

  if (isRawGeminiRequest) {
    console.log(`[connector:${connectorId}] raw Gemini model: ${rawModel}`);
    return send(res, 200, geminiGenerateContentResponse(answer));
  }

  const payload = connector.responseFormat === "gemini-full"
    ? geminiFullResponse(connectorId, connector, answer)
    : textOnlyResponse(connectorId, connector, answer);

  return send(res, 200, payload);
}

function send(res, status, payload = null) {
  const body = payload === null ? "" : JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  });
  res.end(body);
}

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use.`);
    console.error("Set PORT to another value before starting the emulator.");
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Gemini emulator demo running on http://localhost:${PORT}`);
  console.log(`Connectors: ${Object.keys(CONNECTORS).join(", ")}`);
  console.log(`API keys:   ${VALID_KEYS.join(", ")}`);
});
