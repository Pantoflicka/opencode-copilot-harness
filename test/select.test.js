'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { matchModel, selectModels } = require('../src/select');
const { loadCatalog, loadProfiles } = require('../src/catalog');
const { parseModelList } = require('../src/opencode');
const fs = require('node:fs');

const available = parseModelList(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'models-pro.txt'), 'utf8')
);

test('přesná shoda bez ohledu na tečky a pomlčky', () => {
  assert.equal(matchModel('claude-sonnet-5.5', ['github-copilot/claude-sonnet-5-5']), 'github-copilot/claude-sonnet-5-5');
});

test('kratší klíč nesmí chytit novější verzi', () => {
  assert.equal(matchModel('claude-sonnet-5', ['github-copilot/claude-sonnet-5.5']), null);
  assert.equal(matchModel('gpt-6-sol', ['github-copilot/gpt-6.1-sol']), null);
});

test('datumová přípona je povolená, varianty mini/max/fast ne', () => {
  assert.equal(matchModel('claude-opus-5.5', ['github-copilot/claude-opus-5.5-20261001']), 'github-copilot/claude-opus-5.5-20261001');
  assert.equal(matchModel('gpt-5.3-codex', ['github-copilot/gpt-5.3-codex-max']), null);
  assert.equal(matchModel('claude-opus-4.8', ['github-copilot/claude-opus-4.8-fast']), null);
});

test('každý klíč z profilů existuje v katalogu', () => {
  const { byKey } = loadCatalog();
  const { profiles } = loadProfiles();
  for (const [name, p] of Object.entries(profiles)) {
    for (const [role, keys] of Object.entries(p.roles)) {
      for (const k of keys) assert.ok(byKey.has(k), `${name}.${role}: ${k} chybí v katalogu`);
    }
  }
});

test('výběr pro Pro bez Opusu padne na dostupné modely', () => {
  const { byKey } = loadCatalog();
  const { profiles, diversify } = loadProfiles();
  const sel = selectModels(profiles.vyvazeny, available, { diversify, catalog: byKey });
  assert.equal(sel.architect.id, 'github-copilot/gpt-6.1-sol'); // Opus není k dispozici
  assert.equal(sel.scout.id, 'github-copilot/claude-haiku-5.5');
  assert.equal(sel.implementer.id, 'github-copilot/claude-sonnet-5.5');
});

test('recenzent je od jiného výrobce než implementer', () => {
  const { byKey } = loadCatalog();
  const { diversify } = loadProfiles();
  const profile = { roles: { implementer: ['gpt-6.1-sol'], reviewer: ['gpt-6-sol', 'claude-sonnet-5.5'] } };
  const sel = selectModels(profile, available, { diversify, catalog: byKey });
  assert.equal(sel.reviewer.id, 'github-copilot/claude-sonnet-5.5');
});

test('ověření modelu: nefunkční model se přeskočí', () => {
  const { byKey } = loadCatalog();
  const profile = { roles: { scout: ['gpt-6-luna', 'claude-haiku-5.5'] } };
  const sel = selectModels(profile, available, {
    catalog: byKey,
    verify: (id) => !id.endsWith('gpt-6-luna'),
  });
  assert.equal(sel.scout.id, 'github-copilot/claude-haiku-5.5');
});

test('nedostupná role vrátí null', () => {
  const sel = selectModels({ roles: { architect: ['claude-opus-5.5'] } }, available);
  assert.equal(sel.architect, null);
});
