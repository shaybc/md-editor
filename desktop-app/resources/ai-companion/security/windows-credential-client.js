/** Private Windows Credential Manager client owned by the desktop AI bridge. */

"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");
const readline = require("node:readline");

const SAFE_ERROR_MESSAGES = Object.freeze({
  CREDENTIAL_NOT_FOUND: "The saved AI provider credential was not found.",
  INVALID_CREDENTIAL_ID: "The AI provider credential reference is invalid.",
  INVALID_SECRET_SIZE: "The AI provider credential is empty or too large.",
  INVALID_STORED_SECRET: "The saved AI provider credential is invalid.",
  CREDENTIAL_WRITE_FAILED: "Windows Credential Manager could not save the AI provider credential.",
  CREDENTIAL_READ_FAILED: "Windows Credential Manager could not read the AI provider credential.",
  CREDENTIAL_STATUS_FAILED: "Windows Credential Manager could not inspect the AI provider credential.",
  CREDENTIAL_DELETE_FAILED: "Windows Credential Manager could not remove the AI provider credential."
});

/**
 * Communicate with the long-lived Windows credential helper over private stdio pipes.
 * No secret is placed in process arguments, environment variables, or application logs.
 */
class WindowsCredentialClient {
  constructor(options = {}) {
    this.executablePath = options.executablePath || path.resolve(__dirname, "../../bridges/windows-credential-helper/windows-credential-helper.exe");
    this.spawnProcess = options.spawnProcess || spawn;
    this.process = null;
    this.pending = new Map();
    this.nextRequestId = 1;
  }

  /** Store a credential and return its opaque identifier. */
  async storeCredential(credentialId, secret) {
    const response = await this.request("write", { credentialId: String(credentialId || ""), secret: String(secret || "") });
    return String(response.credentialId || "");
  }

  /** Read a credential for provider construction inside the backend boundary. */
  async readCredential(credentialId) {
    const response = await this.request("read", { credentialId: String(credentialId || "") });
    return String(response.secret || "");
  }

  /** Check whether a credential exists without exposing its value. */
  async credentialExists(credentialId) {
    const response = await this.request("exists", { credentialId: String(credentialId || "") });
    return response.exists === true;
  }

  /** Delete a credential; an already absent credential is considered deleted. */
  async deleteCredential(credentialId) {
    const response = await this.request("delete", { credentialId: String(credentialId || "") });
    return response.deleted === true;
  }

  /** Stop the helper and reject outstanding operations. */
  close() {
    const current = this.process;
    this.process = null;
    current?.stdin?.end?.();
    current?.kill?.();
    this.rejectPending(credentialError("CREDENTIAL_HELPER_STOPPED"));
  }

  async request(action, payload) {
    const child = this.ensureProcess();
    const id = String(this.nextRequestId++);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ id, action, ...payload })}\n`, (error) => {
        if (!error) return;
        this.pending.delete(id);
        reject(credentialError("CREDENTIAL_HELPER_UNAVAILABLE"));
      });
    });
  }

  ensureProcess() {
    if (this.process && !this.process.killed) return this.process;
    const child = this.spawnProcess(this.executablePath, [], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    this.process = child;
    const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on("line", (line) => this.handleResponse(line));
    child.stderr.on("data", () => {});
    child.once("error", () => this.handleExit(child));
    child.once("exit", () => this.handleExit(child));
    return child;
  }

  handleResponse(line) {
    let response;
    try { response = JSON.parse(String(line || "{}")); }
    catch (_error) { return; }
    const pending = this.pending.get(String(response.id || ""));
    if (!pending) return;
    this.pending.delete(String(response.id));
    if (response.ok === true) pending.resolve(response);
    else pending.reject(credentialError(String(response.errorCode || "CREDENTIAL_OPERATION_FAILED")));
  }

  handleExit(child) {
    if (this.process !== child) return;
    this.process = null;
    this.rejectPending(credentialError("CREDENTIAL_HELPER_UNAVAILABLE"));
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

function credentialError(code) {
  const error = new Error(SAFE_ERROR_MESSAGES[code] || "Secure AI provider credential storage is unavailable.");
  error.code = code;
  error.retryable = false;
  return error;
}

module.exports = { WindowsCredentialClient, credentialError };
