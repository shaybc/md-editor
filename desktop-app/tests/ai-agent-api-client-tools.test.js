const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const apiTools = require("../resources/ai-companion/tools/api-client-agent-tools");
const { getAgentToolDefinitions } = require("../resources/ai-companion/core/agent-tool-loop");

async function createProfileRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "md-editor-api-agent-"));
}

function startEchoServer() {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        method: request.method,
        authorization: request.headers.authorization || ""
      }));
    });
    server.listen(0, "127.0.0.1", () => {
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${server.address().port}`
      });
    });
  });
}

test("API agent tools are exposed to the AI Companion tool loop", () => {
  const names = getAgentToolDefinitions("agent").map((definition) => definition.function.name);

  for (const name of ["api_asset_search", "api_asset_get", "request_create", "request_update", "request_send", "request_history_get", "response_analyze", "environment_get", "environment_update", "environment_resolve", "secret_redact", "mock_create", "mock_update", "mock_call"]) {
    assert.equal(names.includes(name), true, `${name} should be exposed`);
  }
});

test("API agent tools create, find, read, and update saved requests", async () => {
  const profileRoot = await createProfileRoot();
  const options = { profileRoot };

  const created = await apiTools.requestCreate("", {
    name: "Users List",
    method: "GET",
    url: "https://example.test/users",
    headersText: "Authorization: Bearer secret-token-value-1234567890"
  }, options);
  const requestId = created.request.id;

  const search = await apiTools.apiAssetSearch("", { query: "users" }, options);
  assert.equal(search.assets.some((asset) => asset.id === `request:${requestId}`), true);
  assert.equal(JSON.stringify(search).includes("secret-token-value"), false);

  const fetched = await apiTools.apiAssetGet("", { id: `request:${requestId}` }, options);
  assert.equal(fetched.name, "Users List");
  assert.equal(fetched.headersText.includes("[redacted]"), true);

  const updated = await apiTools.requestUpdate("", {
    requestId,
    patch: { method: "POST", bodyMode: "raw", bodyText: "{\"ok\":true}" }
  }, options);
  assert.equal(updated.request.method, "POST");
  assert.equal(updated.request.bodyText, "{\"ok\":true}");
});

test("API agent request_create saves into folder asset ids returned by search", async () => {
  const profileRoot = await createProfileRoot();
  const options = { profileRoot };
  const collectionPath = path.join(profileRoot, "api-client", "collections.json");
  await fs.mkdir(path.dirname(collectionPath), { recursive: true });
  await fs.writeFile(collectionPath, JSON.stringify({
    version: 1,
    root: {
      id: "root",
      type: "folder",
      name: "Saved Requests",
      children: [
        { id: "folder-target", type: "folder", name: "my-test", children: [] }
      ]
    }
  }), "utf8");

  await apiTools.requestCreate("", {
    parentId: "folder:folder-target",
    name: "Take 2",
    method: "POST",
    url: "https://example.test/posts"
  }, options);

  const saved = JSON.parse(await fs.readFile(collectionPath, "utf8"));
  assert.equal(saved.root.children.length, 1);
  assert.equal(saved.root.children[0].children[0].name, "Take 2");
});

test("API agent environment tools mask secrets and resolve variables safely", async () => {
  const profileRoot = await createProfileRoot();
  const options = { profileRoot };

  await apiTools.environmentUpdate("", {
    scope: "globals",
    variables: [
      { key: "baseUrl", currentValue: "https://api.example.test" },
      { key: "token", type: "secret", currentValue: "secret-token-value-1234567890" }
    ]
  }, options);

  const environments = await apiTools.environmentGet("", {}, options);
  assert.equal(environments.globals.find((variable) => variable.key === "token").currentValue, "[redacted]");

  const resolved = await apiTools.environmentResolve("", {
    request: {
      url: "{{baseUrl}}/users",
      headersText: "Authorization: Bearer {{token}}"
    }
  }, options);
  assert.equal(resolved.resolved.url, "https://api.example.test/users");
  assert.equal(resolved.resolved.headersText, "Authorization: [redacted]");
});

test("API agent request_send resolves variables, redacts output, and stores history", async () => {
  const profileRoot = await createProfileRoot();
  const options = { profileRoot };
  const { server, baseUrl } = await startEchoServer();
  try {
    await apiTools.environmentUpdate("", {
      scope: "globals",
      variables: [{ key: "token", type: "secret", currentValue: "secret-token-value-1234567890" }]
    }, options);
    const created = await apiTools.requestCreate("", {
      name: "Echo",
      method: "GET",
      url: `${baseUrl}/echo`,
      headersText: "Authorization: Bearer {{token}}"
    }, options);

    const result = await apiTools.requestSend("", { requestId: created.request.id }, options);
    assert.equal(result.ok, true);
    assert.equal(result.response.statusCode, 200);
    assert.equal(JSON.stringify(result).includes("secret-token-value"), false);

    const history = await apiTools.requestHistoryGet("", { maxEntries: 1 }, options);
    assert.equal(history.entries.length, 1);
    assert.equal(JSON.stringify(history).includes("secret-token-value"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("API agent mock tools create, update, and call lightweight mocks", async () => {
  const profileRoot = await createProfileRoot();
  const options = { profileRoot };

  const created = await apiTools.mockCreate("", {
    name: "User Mock",
    method: "GET",
    path: "/users/1",
    statusCode: 200,
    body: "{\"id\":1}"
  }, options);
  const mockId = created.mock.id;

  await apiTools.mockUpdate("", { mockId, patch: { statusCode: 201, body: "{\"created\":true}" } }, options);
  const called = await apiTools.mockCall("", { mockId }, options);

  assert.equal(called.ok, true);
  assert.equal(called.response.statusCode, 201);
  assert.equal(called.response.body, "{\"created\":true}");
});

test("API agent secret_redact removes common credentials and PII", async () => {
  const result = await apiTools.secretRedact("", {
    text: "Authorization: Bearer secret-token-value-1234567890\nemail: user@example.com"
  });

  assert.equal(result.redacted.includes("secret-token-value"), false);
  assert.equal(result.redacted.includes("user@example.com"), false);
  assert.ok(result.findings.length >= 2);
});
