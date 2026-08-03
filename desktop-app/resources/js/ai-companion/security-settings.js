(function(window) {
  "use strict";

  const ECOSYSTEMS = ["npm", "yarn", "pnpm", "maven", "gradle"];

  function createDefaultUserPolicy() {
    return {
      version: 1,
      shell: { mode: "deny-and-audit" },
      packages: {
        rules: ECOSYSTEMS.map(function(ecosystem) {
          return { ecosystem, packageId: "*", version: "*", action: "*", registry: "*" };
        })
      },
      packageBinaries: { npx: false, yarnDlx: false, pnpmDlx: false }
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function registerMarkdownViewerAiSecuritySettings(app, deps) {
    const elements = {
      shellMode: document.getElementById("settings-ai-security-shell-mode"),
      autoRun: document.getElementById("settings-ai-agent-auto-run-commands"),
      npx: document.getElementById("settings-ai-security-binary-npx"),
      yarnDlx: document.getElementById("settings-ai-security-binary-yarn-dlx"),
      pnpmDlx: document.getElementById("settings-ai-security-binary-pnpm-dlx"),
      registries: document.getElementById("settings-ai-security-registries"),
      ruleEcosystem: document.getElementById("settings-ai-security-rule-ecosystem"),
      rulePackage: document.getElementById("settings-ai-security-rule-package"),
      ruleVersion: document.getElementById("settings-ai-security-rule-version"),
      ruleAction: document.getElementById("settings-ai-security-rule-action"),
      ruleRegistry: document.getElementById("settings-ai-security-rule-registry"),
      ruleAdd: document.getElementById("settings-ai-security-rule-add"),
      ruleList: document.getElementById("settings-ai-security-rule-list"),
      advanced: document.getElementById("settings-ai-security-policy-json"),
      source: document.getElementById("settings-ai-security-effective-source"),
      managed: document.getElementById("settings-ai-security-managed-status"),
      audit: document.getElementById("settings-ai-security-audit-location"),
      status: document.getElementById("settings-ai-security-status")
    };
    elements.ecosystems = Object.fromEntries(ECOSYSTEMS.map(function(ecosystem) {
      return [ecosystem, document.getElementById(`settings-ai-security-package-${ecosystem}`)];
    }));
    let customRules = [];

    function renderCustomRules() {
      if (!elements.ruleList) return;
      elements.ruleList.replaceChildren();
      if (!customRules.length) {
        const empty = document.createElement("p");
        empty.className = "settings-panel-description";
        empty.textContent = "No package-specific rules. Enabled package managers use the wildcard rules above.";
        elements.ruleList.appendChild(empty);
        return;
      }
      customRules.forEach(function(rule, index) {
        const row = document.createElement("div");
        row.className = "settings-ai-security-rule-row";
        const text = document.createElement("span");
        text.textContent = `${rule.ecosystem}: ${rule.packageId} @ ${rule.version || "*"} · ${rule.action || "*"} · ${rule.registry || "*"}`;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "reset-modal-btn settings-secondary-action";
        remove.textContent = "Remove";
        remove.addEventListener("click", function() {
          customRules.splice(index, 1);
          renderCustomRules();
          if (elements.advanced) elements.advanced.value = JSON.stringify(collect(), null, 2);
        });
        row.append(text, remove);
        elements.ruleList.appendChild(row);
      });
    }

    function normalize(value) {
      const source = value && typeof value === "object" && !Array.isArray(value) ? clone(value) : createDefaultUserPolicy();
      if (Number(source.version) !== 1) throw new Error("AI security policy version must be 1.");
      source.shell = Object.assign({ mode: "deny-and-audit" }, source.shell || {});
      if (!["deny-and-audit", "sandbox-shell"].includes(source.shell.mode)) throw new Error("Invalid AI shell security mode.");
      source.packages = Object.assign({ rules: [] }, source.packages || {});
      if (!Array.isArray(source.packages.rules)) throw new Error("Package rules must be an array.");
      source.packages.rules.forEach(function(rule, index) {
        if (!rule || typeof rule !== "object" || !ECOSYSTEMS.includes(rule.ecosystem)) throw new Error(`Package rule ${index + 1} has an unsupported ecosystem.`);
        const packageId = String(rule.packageId || "").trim();
        const version = String(rule.version || "*").trim();
        const registry = String(rule.registry || "*").trim();
        if (packageId !== "*" && !/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(packageId)) throw new Error(`Package rule ${index + 1} has an invalid package ID.`);
        if (!/^[a-z0-9*^~<>=|.+_-]+$/i.test(version)) throw new Error(`Package rule ${index + 1} has an invalid version pattern.`);
        if (!["install", "update", "remove", "download", "*"].includes(rule.action)) throw new Error(`Package rule ${index + 1} has an unsupported action.`);
        if (registry !== "*" && !/^https?:\/\/\S+$/i.test(registry)) throw new Error(`Package rule ${index + 1} has an invalid registry.`);
      });
      source.packageBinaries = Object.assign({ npx: false, yarnDlx: false, pnpmDlx: false }, source.packageBinaries || {});
      return source;
    }

    function updateShellInteraction() {
      const sandboxEnabled = elements.shellMode?.value === "sandbox-shell";
      if (elements.autoRun) {
        elements.autoRun.disabled = !sandboxEnabled;
        elements.autoRun.closest(".settings-switch-row")?.classList.toggle("is-disabled", !sandboxEnabled);
      }
    }

    function apply(policyValue, autoRunValue) {
      let policy;
      try {
        policy = normalize(policyValue);
      } catch (_error) {
        policy = createDefaultUserPolicy();
      }
      if (elements.shellMode) elements.shellMode.value = policy.shell.mode;
      if (elements.autoRun) elements.autoRun.checked = autoRunValue === true;
      if (elements.npx) elements.npx.checked = policy.packageBinaries.npx === true;
      if (elements.yarnDlx) elements.yarnDlx.checked = policy.packageBinaries.yarnDlx === true;
      if (elements.pnpmDlx) elements.pnpmDlx.checked = policy.packageBinaries.pnpmDlx === true;
      const rules = policy.packages.rules;
      customRules = rules.filter(function(rule) {
        return !(ECOSYSTEMS.includes(rule.ecosystem) && rule.packageId === "*" && rule.version === "*" && rule.action === "*");
      }).map(clone);
      renderCustomRules();
      for (const ecosystem of ECOSYSTEMS) {
        if (elements.ecosystems[ecosystem]) {
          elements.ecosystems[ecosystem].checked = rules.some(function(rule) {
            return rule.ecosystem === ecosystem && rule.packageId === "*" && rule.version === "*" && rule.action === "*";
          });
        }
      }
      const registries = Array.from(new Set(rules.map(function(rule) { return String(rule.registry || "*"); })));
      if (elements.registries) elements.registries.value = registries.join(", ");
      if (elements.advanced) elements.advanced.value = JSON.stringify(policy, null, 2);
      if (elements.status) elements.status.textContent = "";
      updateShellInteraction();
      void refreshEffectiveStatus();
    }

    function collect() {
      let policy = createDefaultUserPolicy();
      if (elements.advanced?.value.trim()) policy = normalize(JSON.parse(elements.advanced.value));
      if (elements.shellMode?.disabled !== true) policy.shell = Object.assign({}, policy.shell, { mode: elements.shellMode?.value || "deny-and-audit" });
      policy.packageBinaries = Object.assign({}, policy.packageBinaries);
      if (elements.npx?.disabled !== true) policy.packageBinaries.npx = elements.npx?.checked === true;
      if (elements.yarnDlx?.disabled !== true) policy.packageBinaries.yarnDlx = elements.yarnDlx?.checked === true;
      if (elements.pnpmDlx?.disabled !== true) policy.packageBinaries.pnpmDlx = elements.pnpmDlx?.checked === true;
      const registries = String(elements.registries?.value || "*").split(",").map(function(value) { return value.trim(); }).filter(Boolean);
      const generatedRules = [];
      for (const ecosystem of ECOSYSTEMS) {
        if (elements.ecosystems[ecosystem]?.checked !== true) continue;
        for (const registry of registries.length ? registries : ["*"]) {
          generatedRules.push({ ecosystem, packageId: "*", version: "*", action: "*", registry });
        }
      }
      if (elements.registries?.disabled !== true) {
        policy.packages = Object.assign({}, policy.packages, { rules: customRules.map(clone).concat(generatedRules) });
      }
      if (elements.advanced) elements.advanced.value = JSON.stringify(policy, null, 2);
      return policy;
    }

    async function refreshEffectiveStatus() {
      if (!deps.bridge?.securityPolicyGet) return;
      try {
        const result = await deps.bridge.securityPolicyGet({
          workspaceRoot: deps.getWorkspaceRoot?.() || "",
          settings: deps.getSettings?.() || {}
        });
        const policy = result?.effectivePolicy || {};
        if (elements.source) {
          const locked = policy.metadata?.lockedFields?.length ? `; ${policy.metadata.lockedFields.length} managed field(s) locked` : "";
          elements.source.textContent = `${policy.metadata?.source || "product-defaults"}${locked}`;
        }
        if (elements.managed) {
          elements.managed.textContent = result?.managed?.found
            ? `${result.managed.valid ? "Loaded" : "Invalid"}: ${result.managed.path}`
            : `Not configured: ${result?.managed?.path || ""}`;
        }
        if (elements.audit) elements.audit.textContent = result?.auditLocation || "";
        if (elements.status) elements.status.textContent = result?.error ? `Policy error: ${result.error}` : "";
        const lockedFields = new Set(policy.metadata?.lockedFields || []);
        if (elements.shellMode) elements.shellMode.disabled = false;
        for (const input of Object.values(elements.ecosystems)) if (input) input.disabled = false;
        if (elements.registries) elements.registries.disabled = false;
        for (const input of [elements.npx, elements.yarnDlx, elements.pnpmDlx]) if (input) input.disabled = false;
        if (lockedFields.has("shell.mode") && elements.shellMode) elements.shellMode.disabled = true;
        if (lockedFields.has("packages.rules")) {
          const effectiveRules = policy.packages?.rules || [];
          const effectiveRuleSets = policy.packages?.ruleSets?.length ? policy.packages.ruleSets : [effectiveRules];
          for (const ecosystem of ECOSYSTEMS) {
            if (elements.ecosystems[ecosystem]) elements.ecosystems[ecosystem].checked = effectiveRuleSets.every(function(rules) { return rules.some(function(rule) { return rule.ecosystem === ecosystem || rule.ecosystem === "*"; }); });
          }
          if (elements.registries) elements.registries.value = Array.from(new Set(effectiveRules.map(function(rule) { return rule.registry || "*"; }))).join(", ");
          for (const input of Object.values(elements.ecosystems)) if (input) input.disabled = true;
          if (elements.registries) elements.registries.disabled = true;
        }
        for (const [field, input] of [["packageBinaries.npx", elements.npx], ["packageBinaries.yarnDlx", elements.yarnDlx], ["packageBinaries.pnpmDlx", elements.pnpmDlx]]) {
          if (lockedFields.has(field) && input) {
            input.checked = policy.packageBinaries?.[field.split(".")[1]] === true;
            input.disabled = true;
          }
        }
        if (lockedFields.has("shell.mode") && elements.shellMode) elements.shellMode.value = policy.shell?.mode || "deny-and-audit";
        updateShellInteraction();
      } catch (error) {
        if (elements.status) elements.status.textContent = error?.message || String(error);
      }
    }

    elements.shellMode?.addEventListener("change", updateShellInteraction);
    elements.ruleAdd?.addEventListener("click", function() {
      const rule = {
        ecosystem: elements.ruleEcosystem?.value || "npm",
        packageId: String(elements.rulePackage?.value || "").trim(),
        version: String(elements.ruleVersion?.value || "*").trim() || "*",
        action: elements.ruleAction?.value || "*",
        registry: String(elements.ruleRegistry?.value || "*").trim() || "*"
      };
      try {
        normalize({ version: 1, packages: { rules: [rule] } });
        customRules.push(rule);
        if (elements.rulePackage) elements.rulePackage.value = "";
        renderCustomRules();
        if (elements.advanced) elements.advanced.value = JSON.stringify(collect(), null, 2);
        if (elements.status) elements.status.textContent = "";
      } catch (error) {
        if (elements.status) elements.status.textContent = error?.message || String(error);
      }
    });
    elements.advanced?.addEventListener("blur", function() {
      try {
        const policy = normalize(JSON.parse(elements.advanced.value || "{}"));
        apply(policy, elements.autoRun?.checked === true);
      } catch (error) {
        if (elements.status) elements.status.textContent = `Policy JSON is invalid: ${error?.message || error}`;
      }
    });

    const api = { apply, collect, createDefaultUserPolicy, normalize, refreshEffectiveStatus, updateShellInteraction };
    app.registerModule("aiSecuritySettings", api);
    return api;
  }

  window.registerMarkdownViewerAiSecuritySettings = registerMarkdownViewerAiSecuritySettings;
})(window);
