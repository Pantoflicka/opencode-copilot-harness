'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PROVIDER } = require('./catalog');

const IS_WIN = process.platform === 'win32';

function run(args, { timeout = 60000 } = {}) {
  const bin = process.env.OPENCODE_BIN || 'opencode';
  // Na Windows je opencode obvykle .cmd shim z npm, proto shell.
  const res = spawnSync(bin, args, {
    encoding: 'utf8',
    timeout,
    shell: IS_WIN,
    windowsHide: true,
  });
  if (res.error) return { ok: false, out: '', err: res.error.message };
  return { ok: res.status === 0, out: res.stdout || '', err: res.stderr || '' };
}

/** Vrátí { raw, major } nebo null, když opencode není nainstalovaný. */
function detectVersion() {
  const r = run(['--version'], { timeout: 20000 });
  if (!r.ok) return null;
  const m = r.out.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { raw: m[0], major: Number(m[1]) };
}

function parseModelList(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith(PROVIDER + '/'))
    .map((l) => l.split(/\s+/)[0]);
}

/**
 * Seznam modelů, které OpenCode nabízí u poskytovatele github-copilot.
 * modelsFile: textový soubor se stejným výpisem (pro testy nebo offline).
 */
function listCopilotModels({ modelsFile, refresh = false } = {}) {
  if (modelsFile) return parseModelList(fs.readFileSync(modelsFile, 'utf8'));
  const args = ['models', PROVIDER];
  if (refresh) args.push('--refresh');
  let r = run(args);
  if (!r.ok && refresh) r = run(['models', PROVIDER]); // starší verze bez --refresh
  if (!r.ok) {
    const e = new Error(
      'Nepodařilo se spustit `opencode models github-copilot`.\n' + (r.err || '').trim()
    );
    e.code = 'NO_MODELS';
    throw e;
  }
  return parseModelList(r.out);
}

/**
 * Ověří model krátkým dotazem. Stojí zlomek kreditu na model.
 * Pozná tak modely, které OpenCode vypíše, ale váš plán je nepovoluje.
 */
function verifyModel(id) {
  const r = run(['run', '-m', id, 'Reply with the single word OK.'], { timeout: 120000 });
  return r.ok && /\bok\b/i.test(r.out);
}

function globalConfigDir() {
  if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR;
  const xdg = process.env.XDG_CONFIG_HOME;
  return path.join(xdg || path.join(os.homedir(), '.config'), 'opencode');
}

module.exports = {
  detectVersion,
  listCopilotModels,
  parseModelList,
  verifyModel,
  globalConfigDir,
};
