'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PROVIDER = 'github-copilot';

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function loadCatalog() {
  const data = readJson('catalog/models.json');
  const byKey = new Map(data.models.map((m) => [m.key, m]));
  return { ...data, byKey };
}

function loadProfiles() {
  return readJson('catalog/profiles.json');
}

/**
 * Typický krok agenta: kontext 40K tokenů, z toho 90 % z cache, 1,5K tokenů výstupu.
 * Vrací odhad v AI kreditech (1 kredit = 0,01 USD).
 */
const TYPICAL_STEP = { input: 40000, cachedShare: 0.9, output: 1500 };

function creditsPerStep(model, step = TYPICAL_STEP) {
  const cached = step.input * step.cachedShare;
  const fresh = step.input - cached;
  const usd =
    (fresh * model.input + cached * model.cached + step.output * model.output) / 1e6;
  return usd * 100;
}

module.exports = { ROOT, PROVIDER, loadCatalog, loadProfiles, creditsPerStep, TYPICAL_STEP };
