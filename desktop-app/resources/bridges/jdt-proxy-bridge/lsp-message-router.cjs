"use strict";

const HEADER_SEPARATOR = Buffer.from("\r\n\r\n", "ascii");

/** Parse byte-accurate LSP frames and route decoded messages without exposing raw stdout. */
class LspMessageRouter {
  constructor(options = {}) {
    this.onMessage = options.onMessage || (() => {});
    this.onDiagnostics = options.onDiagnostics || (() => {});
    this.onStatus = options.onStatus || (() => {});
    this.onRequestCompleted = options.onRequestCompleted || (() => {});
    this.onWarning = options.onWarning || (() => {});
    this.write = options.write || (() => {});
    this.buffer = Buffer.alloc(0);
    this.pendingRequests = new Map();
    this.progressByToken = new Map();
    this.progressTimer = null;
    this.logStatusKeys = new Set();
  }

  acceptChunk(chunk) {
    const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk || "", "utf8");
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, next]) : next;
    while (this.buffer.length) {
      const headerEnd = this.buffer.indexOf(HEADER_SEPARATOR);
      if (headerEnd < 0) return;
      const header = this.buffer.subarray(0, headerEnd).toString("ascii");
      const match = header.match(/(?:^|\r\n)Content-Length:\s*(\d+)/i);
      if (!match) {
        this.onWarning({ reason: "missing-content-length" });
        this.buffer = this.buffer.subarray(headerEnd + HEADER_SEPARATOR.length);
        continue;
      }
      const length = Number(match[1]);
      const payloadStart = headerEnd + HEADER_SEPARATOR.length;
      if (this.buffer.length < payloadStart + length) return;
      const payload = this.buffer.subarray(payloadStart, payloadStart + length).toString("utf8");
      this.buffer = this.buffer.subarray(payloadStart + length);
      this.routePayload(payload);
    }
  }

  routePayload(payload) {
    if (/"method"\s*:\s*"textDocument\/publishDiagnostics"/.test(payload)) {
      this.onDiagnostics(payload);
      return;
    }
    let message;
    try {
      message = JSON.parse(payload);
    } catch (error) {
      this.onWarning({ reason: "invalid-json", message: error?.message || String(error) });
      return;
    }
    if (message?.method === "$/progress") {
      const token = String(message.params?.token ?? "workspace");
      this.progressByToken.set(token, message);
      this.scheduleProgressFlush();
      return;
    }
    if (message?.method === "window/logMessage") {
      const severity = Number(message.params?.type);
      const classificationMessage = String(message.params?.message || "");
      const text = classificationMessage.slice(0, 500);
      if (severity <= 2 && !this.logStatusKeys.has(text) && this.logStatusKeys.size < 1000) {
        this.logStatusKeys.add(text);
        this.onStatus({ phase: "log", level: severity === 1 ? "error" : "warning", message: text, classificationMessage });
      }
      return;
    }
    if (["language/status", "language/eventNotification"].includes(message?.method)) {
      this.onStatus({ phase: "lifecycle", message });
      return;
    }
    if (message?.id !== undefined && !message.method) {
      const pending = this.pendingRequests.get(String(message.id));
      this.pendingRequests.delete(String(message.id));
      if (pending?.expiresAt && Date.now() > pending.expiresAt) return;
      if (pending?.method === "initialize" && !message.error) this.onStatus({ phase: "initialized" });
      if (pending) this.onRequestCompleted({
        requestId: String(message.id),
        method: pending.method,
        generationId: pending.generationId,
        workspaceRoot: pending.workspaceRoot,
        succeeded: !message.error
      });
    }
    this.onMessage(message);
  }

  send(message, metadata = {}) {
    const expiresAt = Number(metadata.expiresAt) || 0;
    if (expiresAt && Date.now() > expiresAt) return false;
    if (message?.id !== undefined && message.method) {
      this.pendingRequests.set(String(message.id), {
        method: String(message.method || ""),
        expiresAt,
        generationId: Number(metadata.generationId) || 0,
        workspaceRoot: String(metadata.workspaceRoot || "")
      });
    }
    const payload = Buffer.from(JSON.stringify(message), "utf8");
    this.write(Buffer.concat([Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, "ascii"), payload]));
    return true;
  }

  scheduleProgressFlush() {
    if (this.progressTimer) return;
    this.progressTimer = setTimeout(() => {
      this.progressTimer = null;
      const messages = Array.from(this.progressByToken.values());
      this.progressByToken.clear();
      messages.forEach((message) => this.onMessage(message));
    }, 16);
  }

  dispose() {
    if (this.progressTimer) clearTimeout(this.progressTimer);
    this.progressTimer = null;
    this.progressByToken.clear();
    this.pendingRequests.clear();
    this.logStatusKeys.clear();
    this.buffer = Buffer.alloc(0);
  }
}

module.exports = { LspMessageRouter };
