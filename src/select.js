'use strict';
const { PROVIDER } = require('./catalog');

/** "github-copilot/claude-sonnet-5.5" -> ["claude","sonnet","5","5"] */
function tokens(id) {
  return String(id)
    .toLowerCase()
    .replace(new RegExp('^' + PROVIDER + '/'), '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Přípony, které smíme ignorovat, když OpenCode hlásí delší ID (datum, "latest").
const IGNORABLE_SUFFIX = /^(\d{6,8}|latest|ga)$/;
// Varianty, které nikdy nechceme vybrat automaticky.
const EXCLUDED_SUFFIX = /^(fast|preview|mini|nano|max)$/;

/**
 * Najde ID modelu z výpisu `opencode models github-copilot`, které odpovídá klíči z katalogu.
 * Přednost má přesná shoda; jinak připustí jen neškodné přípony (datum apod.).
 */
function matchModel(key, availableIds) {
  const want = tokens(key);
  let prefixHit = null;
  for (const id of availableIds) {
    const have = tokens(id);
    if (have.length < want.length) continue;
    if (!want.every((t, i) => t === have[i])) continue;
    const rest = have.slice(want.length);
    if (rest.length === 0) return id;
    if (rest.some((t) => EXCLUDED_SUFFIX.test(t))) continue;
    if (rest.every((t) => IGNORABLE_SUFFIX.test(t)) && !prefixHit) prefixHit = id;
  }
  return prefixHit;
}

function fullId(id) {
  return id.includes('/') ? id : `${PROVIDER}/${id}`;
}

/**
 * Vybere model pro každou roli profilu.
 * @param {object} profile    položka z profiles.json
 * @param {string[]|null} available  ID modelů od OpenCode; null = neznámé (offline), bere se první kandidát
 * @param {object} [opts]
 * @param {object} [opts.diversify]  { reviewer: "implementer" } = recenzent jiného výrobce než implementer
 * @param {Map} [opts.catalog]       byKey z katalogu (kvůli výrobci)
 * @param {(id:string)=>boolean} [opts.verify]  volitelné ověření, že model opravdu funguje
 */
function selectModels(profile, available, opts = {}) {
  const { diversify = {}, catalog = new Map(), verify } = opts;
  const result = {};
  const failed = new Set();

  const roles = Object.keys(profile.roles);
  // Role, které se mají lišit od jiné role, vyhodnotíme až po ní.
  roles.sort((a, b) => (diversify[a] ? 1 : 0) - (diversify[b] ? 1 : 0));

  for (const role of roles) {
    const candidates = profile.roles[role];
    const avoidVendor =
      diversify[role] && result[diversify[role]]
        ? catalog.get(result[diversify[role]].key)?.vendor
        : null;

    const ordered = avoidVendor
      ? [
          ...candidates.filter((k) => catalog.get(k)?.vendor !== avoidVendor),
          ...candidates.filter((k) => catalog.get(k)?.vendor === avoidVendor),
        ]
      : candidates;

    let chosen = null;
    for (const key of ordered) {
      const id = available ? matchModel(key, available) : key;
      if (!id) continue;
      const full = fullId(id);
      if (failed.has(full)) continue;
      if (verify && !verify(full)) {
        failed.add(full);
        continue;
      }
      chosen = { key, id: full };
      break;
    }
    result[role] = chosen; // null = nic z kandidátů není dostupné
  }
  return result;
}

module.exports = { tokens, matchModel, selectModels, fullId };
