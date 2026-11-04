'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { install, uninstall } = require('../src/install');
const { renderAgent } = require('../src/render');

const selection = {
  copilot: { key: 'gpt-6.1-sol', id: 'github-copilot/gpt-6.1-sol' },
  quick: { key: 'gpt-6-luna', id: 'github-copilot/gpt-6-luna' },
  scout: { key: 'gpt-6-luna', id: 'github-copilot/gpt-6-luna' },
  implementer: { key: 'claude-sonnet-5.5', id: 'github-copilot/claude-sonnet-5.5' },
  architect: { key: 'gpt-6.1-sol', id: 'github-copilot/gpt-6.1-sol' },
  reviewer: { key: 'gpt-6.1-sol', id: 'github-copilot/gpt-6.1-sol' },
};

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'och-'));

test('render 2.x používá permissions pole a steps', () => {
  const md = renderAgent('scout', 'github-copilot/gpt-6-luna', 2);
  assert.match(md, /^---\n/);
  assert.match(md, /mode: subagent/);
  assert.match(md, /permissions:\n  - action: edit\n    resource: "\*"\n    effect: deny/);
  assert.match(md, /steps: 30/);
});

test('render 1.x používá permission objekt', () => {
  const md = renderAgent('reviewer', 'github-copilot/gpt-6.1-sol', 1);
  assert.match(md, /permission:\n  edit: deny\n  bash:\n    "\*": deny/);
  assert.doesNotMatch(md, /permissions:/);
  assert.doesNotMatch(md, /steps:/);
});

test('instalace a odinstalace vrátí konfiguraci do původního stavu', () => {
  const dir = tmp();
  const cfgFile = path.join(dir, 'opencode.json');
  const original = { $schema: 'https://opencode.ai/config.json', theme: 'tokyonight', agent: { explore: { color: 'info' } } };
  fs.writeFileSync(cfgFile, JSON.stringify(original));

  const r = install({ selection, major: 2, profileName: 'uspora', configDir: dir });
  assert.equal(r.written.length, 6);
  assert.equal(r.config.mode, 'merged');
  const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  // existující klíč "agent" (1.x) se zachová, i když je OpenCode 2.x
  assert.equal(cfg.agent.explore.model, 'github-copilot/gpt-6-luna');
  assert.equal(cfg.agent.explore.color, 'info');
  assert.equal(cfg.default_agent, 'copilot');
  assert.equal(cfg.small_model, 'github-copilot/gpt-6-luna');
  assert.equal(cfg.theme, 'tokyonight');

  // opakovaná instalace přepíše vlastní soubory bez --force
  const r2 = install({ selection, major: 2, profileName: 'vyvazeny', configDir: dir });
  assert.equal(r2.skipped.length, 0);

  const u = uninstall({ configDir: dir });
  assert.equal(u.found, true);
  assert.equal(u.restored, true);
  const back = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  assert.deepEqual(back.agent, { explore: { color: 'info' } });
  assert.equal(back.default_agent, undefined);
  assert.equal(back.small_model, undefined);
  assert.equal(fs.readdirSync(path.join(dir, 'agents')).length, 0);
});

test('cizí soubor agenta se bez --force nepřepíše', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'agents'));
  fs.writeFileSync(path.join(dir, 'agents', 'reviewer.md'), 'můj vlastní');
  const r = install({ selection, major: 2, profileName: 'uspora', configDir: dir });
  assert.equal(r.skipped.length, 1);
  assert.equal(fs.readFileSync(path.join(dir, 'agents', 'reviewer.md'), 'utf8'), 'můj vlastní');
});

test('JSONC s komentáři se nemění, vznikne úryvek', () => {
  const dir = tmp();
  const cfgFile = path.join(dir, 'opencode.jsonc');
  fs.writeFileSync(cfgFile, '{\n  // komentář\n  "theme": "x"\n}\n');
  const r = install({ selection, major: 2, profileName: 'uspora', configDir: dir });
  assert.equal(r.config.mode, 'snippet');
  assert.ok(fs.existsSync(r.config.snippetFile));
  assert.match(fs.readFileSync(cfgFile, 'utf8'), /komentář/);
  const snip = JSON.parse(fs.readFileSync(r.config.snippetFile, 'utf8'));
  assert.equal(snip.agents.explore.model, 'github-copilot/gpt-6-luna');
});

test('dry-run nic nezapíše', () => {
  const dir = tmp();
  install({ selection, major: 2, profileName: 'uspora', configDir: dir, dryRun: true });
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('odinstalace smaže opencode.json, který harness sám vytvořil', () => {
  const dir = tmp();
  install({ selection, major: 2, profileName: 'uspora', configDir: dir });
  uninstall({ configDir: dir });
  assert.equal(fs.existsSync(path.join(dir, 'opencode.json')), false);
});
