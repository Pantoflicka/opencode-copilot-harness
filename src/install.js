'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { renderAgent, configPatch } = require('./render');
const { ROLES } = require('./roles');
const { globalConfigDir } = require('./opencode');

const MANIFEST = '.copilot-harness.json';
const SNIPPET = 'opencode.copilot-harness.json';

function resolveTargets({ scope = 'global', configDir, projectDir = process.cwd() }) {
  if (scope === 'project') {
    const base = path.join(projectDir, '.opencode');
    const candidates = [
      path.join(projectDir, 'opencode.json'),
      path.join(projectDir, 'opencode.jsonc'),
      path.join(base, 'opencode.json'),
      path.join(base, 'opencode.jsonc'),
    ];
    return {
      base,
      agentsDir: path.join(base, 'agents'),
      configFile: candidates.find((f) => fs.existsSync(f)) || candidates[0],
    };
  }
  const base = configDir || globalConfigDir();
  const candidates = [path.join(base, 'opencode.json'), path.join(base, 'opencode.jsonc')];
  return {
    base,
    agentsDir: path.join(base, 'agents'),
    configFile: candidates.find((f) => fs.existsSync(f)) || candidates[0],
  };
}

function readManifest(base) {
  const f = path.join(base, MANIFEST);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}

/** Načte opencode.json. Vrací { data, editable }; JSONC s komentáři neupravujeme automaticky. */
function readConfig(file) {
  if (!fs.existsSync(file)) return { data: {}, editable: true, exists: false };
  const text = fs.readFileSync(file, 'utf8');
  try {
    return { data: JSON.parse(text), editable: true, exists: true };
  } catch {
    return { data: {}, editable: false, exists: true };
  }
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

function install(opts) {
  const { selection, major, profileName, force = false, dryRun = false } = opts;
  const t = resolveTargets(opts);
  const prev = readManifest(t.base);
  const owned = new Set(prev?.files || []);
  const report = { targets: t, written: [], skipped: [], missing: [], config: null, dryRun };

  if (!selection.copilot) {
    throw new Error(
      'Pro hlavního agenta není dostupný žádný model z profilu. Zkuste jiný profil nebo `och doctor`.'
    );
  }

  // 1) Soubory agentů
  const files = [];
  for (const role of Object.keys(ROLES)) {
    const sel = selection[role];
    if (!sel) {
      report.missing.push(role);
      continue;
    }
    const file = path.join(t.agentsDir, `${role}.md`);
    if (fs.existsSync(file) && !owned.has(file) && !force) {
      report.skipped.push({ role, file, reason: 'soubor už existuje (použijte --force)' });
      continue;
    }
    const content = renderAgent(role, sel.id, major);
    if (!dryRun) {
      fs.mkdirSync(t.agentsDir, { recursive: true });
      fs.writeFileSync(file, content, 'utf8');
    }
    files.push(file);
    report.written.push({ role, file, model: sel.id });
  }

  // 2) opencode.json: modely vestavěných agentů a výchozí agent
  const cfg = readConfig(t.configFile);
  const patch = configPatch(selection, major, cfg.data);
  // Původní hodnoty si pamatujeme jen při první instalaci, aby šly obnovit.
  const previous =
    prev?.config?.previous ||
    {
      default_agent: cfg.data.default_agent ?? null,
      small_model: cfg.data.small_model ?? null,
      createdConfig: !cfg.exists,
      agents: Object.fromEntries(
        Object.keys(patch.agents).map((k) => [k, cfg.data[patch.agentKey]?.[k] ?? null])
      ),
    };

  const next = structuredClone(cfg.data);
  if (!next.$schema) next.$schema = 'https://opencode.ai/config.json';
  next[patch.agentKey] = next[patch.agentKey] || {};
  for (const [name, entry] of Object.entries(patch.agents)) {
    next[patch.agentKey][name] = { ...(next[patch.agentKey][name] || {}), ...entry };
  }
  next.default_agent = patch.default_agent;
  if (patch.small_model) next.small_model = patch.small_model;

  if (cfg.editable) {
    let backup = null;
    if (!dryRun) {
      if (cfg.exists) {
        backup = `${t.configFile}.bak-${stamp()}`;
        fs.copyFileSync(t.configFile, backup);
      }
      fs.mkdirSync(path.dirname(t.configFile), { recursive: true });
      fs.writeFileSync(t.configFile, JSON.stringify(next, null, 2) + '\n', 'utf8');
    }
    report.config = { mode: 'merged', file: t.configFile, backup, patch };
  } else {
    // JSONC: nepřepisujeme komentáře uživatele, jen připravíme úryvek k ručnímu vložení.
    const snippetFile = path.join(path.dirname(t.configFile), SNIPPET);
    const snippet = {
      [patch.agentKey]: patch.agents,
      default_agent: patch.default_agent,
      ...(patch.small_model ? { small_model: patch.small_model } : {}),
    };
    if (!dryRun) fs.writeFileSync(snippetFile, JSON.stringify(snippet, null, 2) + '\n', 'utf8');
    files.push(snippetFile);
    report.config = { mode: 'snippet', file: t.configFile, snippetFile, patch };
  }

  // 3) Manifest pro odinstalaci a aktualizace
  if (!dryRun) {
    const manifest = {
      tool: 'opencode-copilot-harness',
      profile: profileName,
      opencodeMajor: major,
      installedAt: new Date().toISOString(),
      selection,
      files,
      config: { file: t.configFile, mode: report.config.mode, agentKey: patch.agentKey, previous },
    };
    fs.mkdirSync(t.base, { recursive: true });
    fs.writeFileSync(path.join(t.base, MANIFEST), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  }
  return report;
}

function uninstall(opts) {
  const t = resolveTargets(opts);
  const m = readManifest(t.base);
  if (!m) return { found: false, targets: t };
  const removed = [];
  for (const f of m.files || []) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      removed.push(f);
    }
  }

  let restored = false;
  const c = m.config;
  if (c?.mode === 'merged' && fs.existsSync(c.file)) {
    const cfg = readConfig(c.file);
    if (cfg.editable) {
      const d = cfg.data;
      const p = c.previous || {};
      const put = (obj, key, val) => (val === null || val === undefined ? delete obj[key] : (obj[key] = val));
      put(d, 'default_agent', p.default_agent);
      if (c.agentKey === 'agent') put(d, 'small_model', p.small_model);
      if (d[c.agentKey]) {
        for (const [name, val] of Object.entries(p.agents || {})) put(d[c.agentKey], name, val);
        if (Object.keys(d[c.agentKey]).length === 0) delete d[c.agentKey];
      }
      const leftover = Object.keys(d).filter((k) => k !== '$schema');
      if (p.createdConfig && leftover.length === 0) {
        fs.unlinkSync(c.file); // soubor vytvořil harness a nic jiného v něm není
      } else {
        fs.copyFileSync(c.file, `${c.file}.bak-${stamp()}`);
        fs.writeFileSync(c.file, JSON.stringify(d, null, 2) + '\n', 'utf8');
      }
      restored = true;
    }
  }
  fs.unlinkSync(path.join(t.base, MANIFEST));
  return { found: true, targets: t, removed, restored, config: c };
}

module.exports = { install, uninstall, resolveTargets, readManifest, MANIFEST };
