#!/usr/bin/env node
'use strict';
const { parseArgs } = require('node:util');
const { loadCatalog, loadProfiles, creditsPerStep, TYPICAL_STEP } = require('../src/catalog');
const { selectModels, matchModel } = require('../src/select');
const oc = require('../src/opencode');
const { install, uninstall, resolveTargets, readManifest } = require('../src/install');
const { ROLES } = require('../src/roles');
const pkg = require('../package.json');

const HELP = `opencode-copilot-harness ${pkg.version}
Sada agentů pro OpenCode, která šetří AI kredity GitHub Copilotu.

Použití:
  och install [volby]     zjistí dostupné modely a nainstaluje agenty (výchozí příkaz)
  och models  [volby]     tabulka modelů, cen a dostupnosti
  och doctor  [volby]     diagnostika: verze OpenCode, modely, co je nainstalováno
  och uninstall [volby]   odebere agenty a vrátí původní nastavení
  och help

Volby:
  -p, --profile <název>   uspora | vyvazeny | vykon   (výchozí: uspora)
  -s, --scope <kde>       global (~/.config/opencode) | project (./.opencode)  (výchozí: global)
      --project-dir <cesta>  projekt pro --scope project (výchozí: aktuální složka)
      --config-dir <cesta>   jiná globální složka OpenCode
      --verify            každý vybraný model krátce otestuje (stojí zlomek kreditu)
      --refresh           obnoví seznam modelů v OpenCode
      --force             přepíše existující soubory agentů stejného jména
      --dry-run           jen ukáže, co by se stalo
      --offline           nespouští opencode, předpokládá dostupnost všech modelů
      --models-file <f>   seznam modelů ze souboru (výstup \`opencode models github-copilot\`)
      --opencode-version <x.y.z>  ručně zadaná verze OpenCode
`;

function parse(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      profile: { type: 'string', short: 'p', default: 'uspora' },
      scope: { type: 'string', short: 's', default: 'global' },
      'project-dir': { type: 'string' },
      'config-dir': { type: 'string' },
      verify: { type: 'boolean', default: false },
      refresh: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      offline: { type: 'boolean', default: false },
      'models-file': { type: 'string' },
      'opencode-version': { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  return { cmd: values.help ? 'help' : positionals[0] || 'install', o: values };
}

const pad = (s, n) => String(s).padEnd(n);
const fmt = (n) => (n < 1 ? n.toFixed(2) : n.toFixed(1)).replace('.', ',');

function getVersion(o) {
  if (o['opencode-version']) {
    const major = Number(o['opencode-version'].split('.')[0]);
    return { raw: o['opencode-version'], major };
  }
  if (o.offline) return { raw: 'neznámá', major: 2 };
  return oc.detectVersion();
}

function getAvailable(o) {
  if (o['models-file']) return oc.listCopilotModels({ modelsFile: o['models-file'] });
  if (o.offline) return null;
  return oc.listCopilotModels({ refresh: o.refresh });
}

function requireOpencode(o) {
  const v = getVersion(o);
  if (!v) {
    console.error(
      'OpenCode nebyl nalezen. Nainstalujte ho (https://opencode.ai), přihlaste se ke GitHub Copilotu\n' +
        'příkazem /connect v OpenCode a spusťte znovu. Bez OpenCode lze použít --offline.'
    );
    process.exit(1);
  }
  return v;
}

function cmdInstall(o) {
  const catalog = loadCatalog();
  const { profiles, diversify } = loadProfiles();
  const profile = profiles[o.profile];
  if (!profile) {
    console.error(`Neznámý profil "${o.profile}". Dostupné: ${Object.keys(profiles).join(', ')}`);
    process.exit(1);
  }
  const version = requireOpencode(o);
  let available;
  try {
    available = getAvailable(o);
  } catch (e) {
    console.error(e.message + '\nJste v OpenCode přihlášeni ke GitHub Copilotu? (/connect)');
    process.exit(1);
  }
  if (available && available.length === 0) {
    console.error('OpenCode nevrátil žádné modely github-copilot. Přihlaste se v OpenCode přes /connect.');
    process.exit(1);
  }

  console.log(`OpenCode ${version.raw} (formát ${version.major >= 2 ? '2.x' : '1.x'}), profil: ${profile.label}`);
  if (available) console.log(`Dostupných modelů Copilotu: ${available.length}`);
  else console.log('Režim offline: dostupnost modelů se neověřuje.');
  if (o.verify) console.log('Ověřuji modely krátkým dotazem…');

  const selection = selectModels(profile, available, {
    diversify,
    catalog: catalog.byKey,
    verify: o.verify && !o.offline ? oc.verifyModel : undefined,
  });

  console.log('\nVýběr modelů:');
  for (const role of Object.keys(ROLES)) {
    const s = selection[role];
    const m = s && catalog.byKey.get(s.key);
    const cost = m ? `~${fmt(creditsPerStep(m))} kr./krok` : '';
    console.log(`  ${pad(role, 12)} ${pad(s ? s.id : '— nic z kandidátů není dostupné', 44)} ${cost}`);
  }

  const report = install({
    selection,
    major: version.major,
    profileName: o.profile,
    scope: o.scope,
    projectDir: o['project-dir'],
    configDir: o['config-dir'],
    force: o.force,
    dryRun: o['dry-run'],
  });

  console.log(`\n${report.dryRun ? '[dry-run] Zapsalo by se' : 'Zapsáno'} do ${report.targets.agentsDir}:`);
  for (const w of report.written) console.log(`  + ${w.role}.md`);
  for (const s of report.skipped) console.log(`  ! ${s.role}.md přeskočen: ${s.reason}`);
  if (report.missing.length) console.log(`  ! bez modelu, nevytvořeno: ${report.missing.join(', ')}`);

  const c = report.config;
  if (c.mode === 'merged') {
    console.log(`\nKonfigurace ${c.file}: výchozí agent "copilot", levné modely pro vestavěné explore/general.`);
    if (c.backup) console.log(`  záloha: ${c.backup}`);
  } else {
    console.log(
      `\nKonfigurace ${c.file} obsahuje komentáře (JSONC), proto se neměnila automaticky.\n` +
        `Vložte do ní obsah souboru ${c.snippetFile}.`
    );
  }
  if (!report.dryRun) {
    console.log('\nHotovo. Spusťte opencode; agenty přepnete klávesou Tab, subagenty voláte @scout, @architect…');
  }
}

function cmdModels(o) {
  const catalog = loadCatalog();
  let available = null;
  try {
    available = o.offline ? null : getAvailable(o);
  } catch {
    available = null;
  }
  console.log(
    `Odhad na krok agenta: ${TYPICAL_STEP.input / 1000}K kontext (${TYPICAL_STEP.cachedShare * 100} % z cache), ` +
      `${fmt(TYPICAL_STEP.output / 1000)}K výstup. 1 kredit = 0,01 USD. Ceny k ${catalog._checked}.\n`
  );
  console.log(`${pad('Model', 20)} ${pad('Třída', 12)} ${pad('Vstup', 7)} ${pad('Cache', 7)} ${pad('Výstup', 7)} ${pad('Kr./krok', 9)} Dostupný`);
  const rows = [...catalog.models].sort((a, b) => creditsPerStep(a) - creditsPerStep(b));
  for (const m of rows) {
    const avail = available ? (matchModel(m.key, available) ? 'ano' : 'ne') : '?';
    console.log(
      `${pad(m.name, 20)} ${pad(m.tier, 12)} ${pad('$' + m.input, 7)} ${pad('$' + m.cached, 7)} ${pad('$' + m.output, 7)} ${pad(fmt(creditsPerStep(m)), 9)} ${avail}${m.note ? '  (' + m.note + ')' : ''}`
    );
  }
  if (!available) console.log('\nDostupnost neznámá (OpenCode nespuštěn nebo --offline).');
}

function cmdDoctor(o) {
  const catalog = loadCatalog();
  const v = getVersion(o);
  console.log(`Node.js: ${process.version}`);
  console.log(`OpenCode: ${v ? v.raw : 'NENALEZEN'}`);
  if (!v) return;
  let available = null;
  try {
    available = getAvailable(o);
  } catch (e) {
    console.log('Modely: chyba — ' + e.message.split('\n')[0]);
  }
  if (available) {
    console.log(`Modely github-copilot: ${available.length}`);
    const known = new Set(catalog.models.map((m) => matchModel(m.key, available)).filter(Boolean));
    const unknown = available.filter((id) => !known.has(id));
    const missing = catalog.models.filter((m) => !matchModel(m.key, available));
    if (missing.length) console.log('  v katalogu, ale nedostupné: ' + missing.map((m) => m.key).join(', '));
    if (unknown.length) console.log('  dostupné, ale nejsou v katalogu (zvažte doplnění catalog/models.json): ' + unknown.join(', '));
  }
  for (const scope of ['global', 'project']) {
    const t = resolveTargets({ scope, configDir: o['config-dir'], projectDir: o['project-dir'] });
    const m = readManifest(t.base);
    console.log(`Instalace (${scope}): ${m ? `profil ${m.profile}, ${m.installedAt}` : 'žádná'}  [${t.base}]`);
    if (m) for (const [r, s] of Object.entries(m.selection)) console.log(`  ${pad(r, 12)} ${s ? s.id : '—'}`);
  }
}

function cmdUninstall(o) {
  const r = uninstall({ scope: o.scope, configDir: o['config-dir'], projectDir: o['project-dir'] });
  if (!r.found) {
    console.log(`V ${r.targets.base} není nic nainstalováno.`);
    return;
  }
  for (const f of r.removed) console.log(`  - ${f}`);
  if (r.restored) console.log(`Původní nastavení v ${r.config.file} obnoveno (záloha vedle souboru).`);
  else if (r.config?.mode === 'snippet') console.log(`Z ${r.config.file} odeberte ručně úpravy, které jste vložili.`);
  console.log('Odinstalováno.');
}

function main() {
  let parsed;
  try {
    parsed = parse(process.argv.slice(2));
  } catch (e) {
    console.error(e.message + '\n\n' + HELP);
    process.exit(1);
  }
  const { cmd, o } = parsed;
  const commands = { install: cmdInstall, models: cmdModels, doctor: cmdDoctor, uninstall: cmdUninstall };
  if (cmd === 'help' || !commands[cmd]) {
    console.log(HELP);
    process.exit(cmd === 'help' ? 0 : 1);
  }
  try {
    commands[cmd](o);
  } catch (e) {
    console.error('Chyba: ' + e.message);
    process.exit(1);
  }
}

main();
