'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./catalog');
const { ROLES, BUILTIN_OVERRIDES } = require('./roles');

const q = (s) => JSON.stringify(String(s)); // JSON řetězec je platný YAML řetězec

function permissionsV2(perm) {
  const rules = [];
  if (perm.edit) rules.push({ action: 'edit', resource: '*', effect: perm.edit });
  if (perm.shell) {
    for (const [resource, effect] of Object.entries(perm.shell)) {
      rules.push({ action: 'shell', resource, effect });
    }
  }
  return rules
    .map(
      (r) =>
        `  - action: ${r.action}\n    resource: ${q(r.resource)}\n    effect: ${r.effect}`
    )
    .join('\n');
}

function permissionsV1(perm) {
  const lines = [];
  if (perm.edit) lines.push(`  edit: ${perm.edit}`);
  if (perm.shell) {
    lines.push('  bash:');
    for (const [pattern, effect] of Object.entries(perm.shell)) {
      lines.push(`    ${q(pattern)}: ${effect}`);
    }
  }
  return lines.join('\n');
}

/**
 * Vytvoří obsah Markdown souboru agenta.
 * @param {string} role   klíč z ROLES
 * @param {string} modelId  např. "github-copilot/claude-sonnet-5.5"
 * @param {1|2} major     hlavní verze OpenCode
 */
function renderAgent(role, modelId, major) {
  const def = ROLES[role];
  if (!def) throw new Error(`Neznámá role: ${role}`);
  const body = fs.readFileSync(path.join(ROOT, 'templates', def.template), 'utf8').trim();

  const fm = [
    `description: ${q(def.description)}`,
    `mode: ${def.mode}`,
    `model: ${modelId}`,
  ];
  if (major >= 2) {
    // Pojmenované barvy zná jen 2.x; 1.x očekává hex, takže barvu tam vynecháme.
    if (def.color) fm.push(`color: ${def.color}`);
    if (def.steps) fm.push(`steps: ${def.steps}`);
    if (def.permissions) fm.push('permissions:\n' + permissionsV2(def.permissions));
  } else if (def.permissions) {
    fm.push('permission:\n' + permissionsV1(def.permissions));
  }
  return `---\n${fm.join('\n')}\n---\n\n${body}\n`;
}

/**
 * Klíče, které harness zapisuje do opencode.json.
 * agentKey: "agents" (2.x) nebo "agent" (1.x); pokud konfigurace už jeden používá, drží se ho.
 */
function configPatch(selection, major, existing = {}) {
  let agentKey = major >= 2 ? 'agents' : 'agent';
  if (existing.agents && !existing.agent) agentKey = 'agents';
  else if (existing.agent && !existing.agents) agentKey = 'agent';

  const agents = {};
  for (const [builtin, role] of Object.entries(BUILTIN_OVERRIDES)) {
    if (selection[role]) agents[builtin] = { model: selection[role].id };
  }
  const patch = { agentKey, agents, default_agent: 'copilot' };
  // small_model (titulky, shrnutí) existuje jen ve formátu 1.x; 2.x ho volí sám.
  if (agentKey === 'agent' && selection.scout) patch.small_model = selection.scout.id;
  return patch;
}

module.exports = { renderAgent, configPatch };
