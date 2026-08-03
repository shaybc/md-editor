(function(global) {
  "use strict";

  const SNIPPET_LANGUAGES = Object.freeze([
    { id: "curl", label: "cURL", syntax: "bash" },
    { id: "shell-wget", label: "Shell - wget", syntax: "bash" },
    { id: "javascript-fetch", label: "JavaScript - Fetch", syntax: "javascript" },
    { id: "javascript-xhr", label: "JavaScript - XHR", syntax: "javascript" },
    { id: "kotlin-okhttp", label: "Kotlin - Okhttp", syntax: "kotlin" },
    { id: "nodejs-request", label: "NodeJs - Request", syntax: "javascript" },
    { id: "powershell-restmethod", label: "PowerShell - RestMethod", syntax: "powershell" },
    { id: "python-requests", label: "Python - Requests", syntax: "python" },
    { id: "swift-urlsession", label: "Swift - URLSession", syntax: "swift" },
    { id: "csharp-httpclient", label: "C# - HttpClient", syntax: "csharp" }
  ]);

  const DEFAULT_LANGUAGE_ID = SNIPPET_LANGUAGES[0].id;
  const DEFAULT_REQUEST_SETTINGS = Object.freeze({
    autoFollowRedirects: true,
    maxRedirects: 10,
    preserveMethodOnRedirect: false,
    timeoutMs: 60000,
    sslCertificateVerification: true,
    sendNoCacheHeader: false,
    maxResponseSizeBytes: 52428800,
    responseRenderMode: "auto",
    decompressResponses: true,
    proxyMode: "system",
    proxyUrl: "",
    httpVersion: "auto"
  });
  const RESPONSE_RENDER_MODES = new Set(["auto", "json", "text", "html", "xml", "binary"]);
  const PROXY_MODES = new Set(["system", "custom"]);
  const HTTP_VERSIONS = new Set(["auto", "http1.1"]);

  /**
   * Generate ready-to-run code snippets for API Client request payloads.
   */
  function registerMarkdownViewerApiClientCodeSnippets(app) {
    function getSnippetLanguages() {
      return SNIPPET_LANGUAGES.map((language) => ({ ...language }));
    }

    function getDefaultSnippetLanguageId() {
      return DEFAULT_LANGUAGE_ID;
    }

    function getSnippetSyntaxLanguage(languageId) {
      const language = SNIPPET_LANGUAGES.find((item) => item.id === languageId) || SNIPPET_LANGUAGES[0];
      return language.syntax;
    }

    function normalizeEnum(value, allowedValues, fallback) {
      const normalized = String(value || "").trim().toLowerCase();
      return allowedValues.has(normalized) ? normalized : fallback;
    }

    function normalizeRequestSettings(value) {
      const settings = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      const maxRedirects = Number(settings.maxRedirects);
      const timeoutMs = Number(settings.timeoutMs);
      const maxResponseSizeBytes = Number(settings.maxResponseSizeBytes);
      return {
        autoFollowRedirects: settings.autoFollowRedirects !== false,
        maxRedirects: Number.isFinite(maxRedirects) ? Math.max(0, Math.min(50, Math.floor(maxRedirects))) : DEFAULT_REQUEST_SETTINGS.maxRedirects,
        preserveMethodOnRedirect: settings.preserveMethodOnRedirect === true,
        timeoutMs: Number.isFinite(timeoutMs) ? Math.max(1000, Math.min(300000, Math.floor(timeoutMs))) : DEFAULT_REQUEST_SETTINGS.timeoutMs,
        sslCertificateVerification: settings.sslCertificateVerification !== false,
        sendNoCacheHeader: settings.sendNoCacheHeader === true,
        maxResponseSizeBytes: Number.isFinite(maxResponseSizeBytes) ? Math.max(1024, Math.min(1073741824, Math.floor(maxResponseSizeBytes))) : DEFAULT_REQUEST_SETTINGS.maxResponseSizeBytes,
        responseRenderMode: normalizeEnum(settings.responseRenderMode, RESPONSE_RENDER_MODES, DEFAULT_REQUEST_SETTINGS.responseRenderMode),
        decompressResponses: settings.decompressResponses !== false,
        proxyMode: normalizeEnum(settings.proxyMode, PROXY_MODES, DEFAULT_REQUEST_SETTINGS.proxyMode),
        proxyUrl: String(settings.proxyUrl || "").trim(),
        httpVersion: normalizeEnum(settings.httpVersion, HTTP_VERSIONS, DEFAULT_REQUEST_SETTINGS.httpVersion)
      };
    }

    function normalizeRequestPayload(payload) {
      return {
        method: String(payload?.method || "GET").toUpperCase(),
        url: String(payload?.url || ""),
        headers: payload?.headers && typeof payload.headers === "object" ? payload.headers : {},
        bodyMode: String(payload?.bodyMode || "none").toLowerCase(),
        body: String(payload?.body || ""),
        formData: Array.isArray(payload?.formData) ? payload.formData : [],
        requestSettings: normalizeRequestSettings(payload?.requestSettings)
      };
    }

    function getHeaderEntries(request) {
      return Object.entries(request.headers || {})
        .filter(([name]) => String(name || "").trim())
        .map(([name, value]) => [String(name).trim(), Array.isArray(value) ? value.join(", ") : String(value ?? "")]);
    }

    function hasHeader(request, headerName) {
      const expected = String(headerName || "").toLowerCase();
      return getHeaderEntries(request).some(([name]) => name.toLowerCase() === expected);
    }

    function getNoCacheHeaderEntries(request) {
      if (!request.requestSettings.sendNoCacheHeader) return [];
      const entries = [];
      if (!hasHeader(request, "Cache-Control")) entries.push(["Cache-Control", "no-cache"]);
      if (!hasHeader(request, "Pragma")) entries.push(["Pragma", "no-cache"]);
      return entries;
    }

    function getContentType(request) {
      const entry = getHeaderEntries(request).find(([name]) => name.toLowerCase() === "content-type");
      return entry ? entry[1] : "application/json";
    }

    function getRequestHeaders(request) {
      return getHeaderEntries(request).filter(([name]) => name.toLowerCase() !== "content-type");
    }

    function hasRequestBody(request) {
      if (request.method === "GET" || request.method === "HEAD") return false;
      if (request.bodyMode === "raw") return request.body.length > 0;
      if (request.bodyMode === "form-data") return request.formData.some((field) => String(field?.key || "").trim());
      return false;
    }

    function hasRawBody(request) {
      return hasRequestBody(request) && request.bodyMode === "raw";
    }

    function hasFormDataBody(request) {
      return hasRequestBody(request) && request.bodyMode === "form-data";
    }

    function getFormDataFields(request) {
      return (request.formData || [])
        .filter((field) => String(field?.key || "").trim())
        .map((field) => ({ key: String(field.key).trim(), value: String(field.value ?? "") }));
    }

    function shellQuote(value) {
      return "'" + String(value ?? "").replace(/'/g, "'\\''") + "'";
    }

    function powershellQuote(value) {
      return "'" + String(value ?? "").replace(/'/g, "''") + "'";
    }

    function jsString(value) {
      return JSON.stringify(String(value ?? ""));
    }

    function pythonString(value) {
      return JSON.stringify(String(value ?? ""));
    }

    function csharpString(value) {
      return "@\"" + String(value ?? "").replace(/"/g, "\"\"") + "\"";
    }

    function kotlinString(value) {
      return "\"\"\"" + String(value ?? "").replace(/"""/g, "\\\"\\\"\\\"") + "\"\"\"";
    }

    function swiftString(value) {
      return JSON.stringify(String(value ?? ""));
    }

    function getTimeoutSeconds(request) {
      return Math.max(1, Math.ceil((request.requestSettings?.timeoutMs || DEFAULT_REQUEST_SETTINGS.timeoutMs) / 1000));
    }

    function buildCurlSnippet(request) {
      const parts = ["curl"];
      if (request.requestSettings.autoFollowRedirects) {
        parts.push("--location", "--max-redirs " + request.requestSettings.maxRedirects);
        if (request.requestSettings.preserveMethodOnRedirect) parts.push("--post301", "--post302");
      }
      parts.push("--max-time " + getTimeoutSeconds(request));
      if (!request.requestSettings.sslCertificateVerification) parts.push("--insecure");
      if (request.requestSettings.decompressResponses) parts.push("--compressed");
      if (request.requestSettings.maxResponseSizeBytes) parts.push("--max-filesize " + request.requestSettings.maxResponseSizeBytes);
      if (request.requestSettings.proxyMode === "custom" && request.requestSettings.proxyUrl) parts.push("--proxy " + shellQuote(request.requestSettings.proxyUrl));
      if (request.requestSettings.httpVersion === "http1.1") parts.push("--http1.1");
      if (request.method !== "GET") parts.push("--request " + request.method);
      getNoCacheHeaderEntries(request).forEach(([name, value]) => parts.push("--header " + shellQuote(name + ": " + value)));
      getHeaderEntries(request).forEach(([name, value]) => parts.push("--header " + shellQuote(name + ": " + value)));
      if (hasRawBody(request)) parts.push("--data-raw " + shellQuote(request.body));
      if (hasFormDataBody(request)) {
        getFormDataFields(request).forEach((field) => parts.push("--form " + shellQuote(field.key + "=" + field.value)));
      }
      parts.push(shellQuote(request.url));
      return parts.join(" \\\n  ");
    }

    function buildWgetSnippet(request) {
      const parts = ["wget --quiet", "--method " + request.method, "--timeout=" + getTimeoutSeconds(request), "--max-redirect=" + (request.requestSettings.autoFollowRedirects ? request.requestSettings.maxRedirects : 0)];
      if (!request.requestSettings.sslCertificateVerification) parts.push("--no-check-certificate");
      if (request.requestSettings.proxyMode === "custom" && request.requestSettings.proxyUrl) parts.push("-e use_proxy=yes", "-e http_proxy=" + shellQuote(request.requestSettings.proxyUrl), "-e https_proxy=" + shellQuote(request.requestSettings.proxyUrl));
      getNoCacheHeaderEntries(request).forEach(([name, value]) => parts.push("--header " + shellQuote(name + ": " + value)));
      getHeaderEntries(request).forEach(([name, value]) => parts.push("--header " + shellQuote(name + ": " + value)));
      if (hasRawBody(request)) parts.push("--body-data " + shellQuote(request.body));
      if (hasFormDataBody(request)) {
        const body = new URLSearchParams(getFormDataFields(request).map((field) => [field.key, field.value])).toString();
        parts.push("--body-data " + shellQuote(body));
      }
      parts.push("--output-document -");
      parts.push(shellQuote(request.url));
      return parts.join(" \\\n  ");
    }

    function buildJavaScriptFetchSnippet(request) {
      const lines = ["const myHeaders = new Headers();"];
      getHeaderEntries(request).forEach(([name, value]) => {
        lines.push("myHeaders.append(" + jsString(name) + ", " + jsString(value) + ");");
      });
      if (hasFormDataBody(request)) {
        lines.push("", "const formdata = new FormData();");
        getFormDataFields(request).forEach((field) => {
          lines.push("formdata.append(" + jsString(field.key) + ", " + jsString(field.value) + ");");
        });
      } else if (hasRawBody(request)) {
        lines.push("", "const raw = " + jsString(request.body) + ";");
      }
      lines.push("", "const requestOptions = {", "  method: " + jsString(request.method) + ",", "  headers: myHeaders,");
      if (hasFormDataBody(request)) lines.push("  body: formdata,");
      else if (hasRawBody(request)) lines.push("  body: raw,");
      if (request.requestSettings.sendNoCacheHeader) lines.push("  cache: " + jsString("no-cache") + ",");
      lines.push("  redirect: " + jsString(request.requestSettings.autoFollowRedirects ? "follow" : "manual") + ",", "  signal: AbortSignal.timeout(" + request.requestSettings.timeoutMs + ")", "};", "", "fetch(" + jsString(request.url) + ", requestOptions)", "  .then((response) => response.text())", "  .then((result) => console.log(result))", "  .catch((error) => console.error(error));");
      return lines.join("\n");
    }

    function buildJavaScriptXhrSnippet(request) {
      const lines = [];
      if (hasFormDataBody(request)) {
        lines.push("var data = new FormData();");
        getFormDataFields(request).forEach((field) => {
          lines.push("data.append(" + jsString(field.key) + ", " + jsString(field.value) + ");");
        });
      } else if (hasRawBody(request)) {
        lines.push("var data = " + jsString(request.body) + ";");
      } else {
        lines.push("var data = null;");
      }
      lines.push("", "var xhr = new XMLHttpRequest();", "xhr.withCredentials = true;", "", "xhr.addEventListener(\"readystatechange\", function() {", "  if(this.readyState === 4) {", "    console.log(this.responseText);", "  }", "});", "", "xhr.open(" + jsString(request.method) + ", " + jsString(request.url) + ");");
      getHeaderEntries(request).forEach(([name, value]) => {
        lines.push("xhr.setRequestHeader(" + jsString(name) + ", " + jsString(value) + ");");
      });
      lines.push("", "xhr.send(data);");
      return lines.join("\n");
    }

    function buildKotlinOkhttpSnippet(request) {
      const lines = ["val client = OkHttpClient()"];
      if (hasRawBody(request)) {
        lines.push("val mediaType = " + kotlinString(getContentType(request)) + ".toMediaType()", "val body = " + kotlinString(request.body) + ".toRequestBody(mediaType)");
      } else if (hasFormDataBody(request)) {
        lines.push("val body = MultipartBody.Builder().setType(MultipartBody.FORM)");
        getFormDataFields(request).forEach((field) => {
          lines.push("  .addFormDataPart(" + kotlinString(field.key) + ", " + kotlinString(field.value) + ")");
        });
        lines.push("  .build()");
      } else if (request.method !== "GET" && request.method !== "HEAD") {
        lines.push("val body = ByteArray(0).toRequestBody(null)");
      }
      lines.push("val request = Request.Builder()", "  .url(" + kotlinString(request.url) + ")");
      if (request.method === "GET" || request.method === "HEAD") lines.push("  ." + request.method.toLowerCase() + "()");
      else lines.push("  .method(" + kotlinString(request.method) + ", body)");
      getHeaderEntries(request).forEach(([name, value]) => {
        lines.push("  .addHeader(" + kotlinString(name) + ", " + kotlinString(value) + ")");
      });
      lines.push("  .build()", "", "val response = client.newCall(request).execute()");
      return lines.join("\n");
    }

    function buildNodeRequestSnippet(request) {
      const lines = ["var request = require('request');", "var options = {", "  'method': " + jsString(request.method) + ",", "  'url': " + jsString(request.url) + ","];
      const headers = getHeaderEntries(request);
      if (headers.length) {
        lines.push("  'headers': {");
        headers.forEach(([name, value], index) => {
          lines.push("    " + jsString(name) + ": " + jsString(value) + (index === headers.length - 1 ? "" : ","));
        });
        lines.push("  },");
      }
      if (hasRawBody(request)) lines.push("  body: " + jsString(request.body) + ",");
      if (hasFormDataBody(request)) {
        lines.push("  formData: {");
        const fields = getFormDataFields(request);
        fields.forEach((field, index) => {
          lines.push("    " + jsString(field.key) + ": " + jsString(field.value) + (index === fields.length - 1 ? "" : ","));
        });
        lines.push("  },");
      }
      lines.push("};", "request(options, function (error, response) {", "  if (error) throw new Error(error);", "  console.log(response.body);", "});");
      return lines.join("\n");
    }

    function buildPowerShellSnippet(request) {
      const lines = ["$headers = New-Object \"System.Collections.Generic.Dictionary[[String],[String]]\""];
      getHeaderEntries(request).forEach(([name, value]) => {
        lines.push("$headers.Add(" + powershellQuote(name) + ", " + powershellQuote(value) + ")");
      });
      if (hasFormDataBody(request)) {
        lines.push("$form = @{}");
        getFormDataFields(request).forEach((field) => {
          lines.push("$form[" + powershellQuote(field.key) + "] = " + powershellQuote(field.value));
        });
      } else if (hasRawBody(request)) {
        lines.push("$body = " + powershellQuote(request.body));
      }
      const command = ["$response = Invoke-RestMethod", "-Uri " + powershellQuote(request.url), "-Method " + powershellQuote(request.method), "-Headers $headers"];
      if (hasFormDataBody(request)) command.push("-Form $form");
      else if (hasRawBody(request)) command.push("-Body $body");
      lines.push("", command.join(" `\n  "), "$response | ConvertTo-Json");
      return lines.join("\n");
    }

    function buildPythonRequestsSnippet(request) {
      const lines = ["import requests", "", "url = " + pythonString(request.url), ""];
      const headers = getHeaderEntries(request);
      lines.push("headers = {");
      headers.forEach(([name, value]) => lines.push("  " + pythonString(name) + ": " + pythonString(value) + ","));
      lines.push("}");
      if (hasRawBody(request)) lines.push("", "payload = " + pythonString(request.body));
      if (hasFormDataBody(request)) {
        lines.push("", "payload = {");
        getFormDataFields(request).forEach((field) => lines.push("  " + pythonString(field.key) + ": " + pythonString(field.value) + ","));
        lines.push("}");
      }
      const args = ["method=" + pythonString(request.method), "url=url", "headers=headers"];
      if (hasRequestBody(request)) args.push("data=payload");
      lines.push("", "response = requests.request(" + args.join(", ") + ")", "", "print(response.text)");
      return lines.join("\n");
    }

    function buildSwiftURLSessionSnippet(request) {
      const lines = ["import Foundation", "", "var request = URLRequest(url: URL(string: " + swiftString(request.url) + ")!)", "request.httpMethod = " + swiftString(request.method)];
      getHeaderEntries(request).forEach(([name, value]) => {
        lines.push("request.addValue(" + swiftString(value) + ", forHTTPHeaderField: " + swiftString(name) + ")");
      });
      if (hasRawBody(request)) {
        lines.push("request.httpBody = " + swiftString(request.body) + ".data(using: .utf8)");
      } else if (hasFormDataBody(request)) {
        lines.push("let boundary = \"Boundary-\\(UUID().uuidString)\"", "request.setValue(\"multipart/form-data; boundary=\\(boundary)\", forHTTPHeaderField: \"Content-Type\")", "var body = Data()");
        getFormDataFields(request).forEach((field) => {
          lines.push("body.append(\"--\\(boundary)\\r\\n\".data(using: .utf8)!)", "body.append(\"Content-Disposition: form-data; name=\\\"" + field.key.replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\\\"\\r\\n\\r\\n\".data(using: .utf8)!)", "body.append(" + swiftString(field.value) + ".data(using: .utf8)!)", "body.append(\"\\r\\n\".data(using: .utf8)!)");
        });
        lines.push("body.append(\"--\\(boundary)--\\r\\n\".data(using: .utf8)!)", "request.httpBody = body");
      }
      lines.push("", "let task = URLSession.shared.dataTask(with: request) { data, response, error in", "  guard let data = data else { return }", "  print(String(data: data, encoding: .utf8) ?? \"\")", "}", "task.resume()");
      return lines.join("\n");
    }

    function buildCSharpHttpClientSnippet(request) {
      const lines = ["using System.Net.Http.Headers;", "using System.Text;", "", "using var client = new HttpClient();", "using var request = new HttpRequestMessage(HttpMethod." + request.method[0] + request.method.slice(1).toLowerCase() + ", " + csharpString(request.url) + ");"];
      getRequestHeaders(request).forEach(([name, value]) => {
        lines.push("request.Headers.TryAddWithoutValidation(" + csharpString(name) + ", " + csharpString(value) + ");");
      });
      if (hasRawBody(request)) {
        lines.push("request.Content = new StringContent(" + csharpString(request.body) + ", Encoding.UTF8);", "request.Content.Headers.ContentType = MediaTypeHeaderValue.Parse(" + csharpString(getContentType(request)) + ");");
      } else if (hasFormDataBody(request)) {
        lines.push("var content = new MultipartFormDataContent();");
        getFormDataFields(request).forEach((field) => {
          lines.push("content.Add(new StringContent(" + csharpString(field.value) + "), " + csharpString(field.key) + ");");
        });
        lines.push("request.Content = content;");
      }
      lines.push("", "using var response = await client.SendAsync(request);", "response.EnsureSuccessStatusCode();", "Console.WriteLine(await response.Content.ReadAsStringAsync());");
      return lines.join("\n");
    }

    function buildSnippet(languageId, payload) {
      const request = normalizeRequestPayload(payload);
      const id = SNIPPET_LANGUAGES.some((language) => language.id === languageId) ? languageId : DEFAULT_LANGUAGE_ID;
      if (id === "curl") return buildCurlSnippet(request);
      if (id === "shell-wget") return buildWgetSnippet(request);
      if (id === "javascript-fetch") return buildJavaScriptFetchSnippet(request);
      if (id === "javascript-xhr") return buildJavaScriptXhrSnippet(request);
      if (id === "kotlin-okhttp") return buildKotlinOkhttpSnippet(request);
      if (id === "nodejs-request") return buildNodeRequestSnippet(request);
      if (id === "powershell-restmethod") return buildPowerShellSnippet(request);
      if (id === "python-requests") return buildPythonRequestsSnippet(request);
      if (id === "swift-urlsession") return buildSwiftURLSessionSnippet(request);
      if (id === "csharp-httpclient") return buildCSharpHttpClientSnippet(request);
      return buildCurlSnippet(request);
    }

    const api = { getSnippetLanguages, getDefaultSnippetLanguageId, getSnippetSyntaxLanguage, buildSnippet };
    app?.registerModule?.("apiClientCodeSnippets", api);
    return api;
  }

  global.registerMarkdownViewerApiClientCodeSnippets = registerMarkdownViewerApiClientCodeSnippets;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerApiClientCodeSnippets };
  }
})(typeof window !== "undefined" ? window : globalThis);
