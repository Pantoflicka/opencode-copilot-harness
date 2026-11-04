'use strict';

// Pravidla oprávnění v neutrálním tvaru; render.js je převede do formátu OpenCode 1.x nebo 2.x.
const READ_ONLY = { edit: 'deny', shell: { '*': 'deny' } };
const READ_ONLY_GIT = {
  edit: 'deny',
  shell: {
    '*': 'deny',
    'git diff*': 'allow',
    'git log*': 'allow',
    'git status*': 'allow',
    'git show*': 'allow',
  },
};

const ROLES = {
  copilot: {
    mode: 'primary',
    color: 'primary',
    description:
      'Hlavní agent: deleguje hledání na levného scouta, práci na implementera, těžká rozhodnutí na architekta.',
    template: 'copilot.md',
  },
  quick: {
    mode: 'primary',
    color: 'success',
    description: 'Levný a rychlý agent na drobné úpravy a rychlé dotazy.',
    template: 'quick.md',
    steps: 25,
  },
  scout: {
    mode: 'subagent',
    color: 'info',
    description:
      'Velmi levný read-only průzkumník: najde soubory, řádky a útržky kódu nebo dokumentace a vrátí stručný report.',
    template: 'scout.md',
    permissions: READ_ONLY,
    steps: 30,
  },
  implementer: {
    mode: 'subagent',
    color: 'accent',
    description:
      'Provede jasně zadanou implementaci napříč soubory, spustí testy a vrátí krátký report.',
    template: 'implementer.md',
    steps: 60,
  },
  architect: {
    mode: 'subagent',
    color: 'warning',
    description:
      'Nejschopnější a nejdražší model. Jen na návrh architektury, těžké chyby a rozhodnutí. Posílej stručné zadání.',
    template: 'architect.md',
    permissions: READ_ONLY_GIT,
    steps: 20,
  },
  reviewer: {
    mode: 'subagent',
    color: 'error',
    description:
      'Recenze změn (git diff) modelem jiného výrobce než implementer: chyby, bezpečnost, chybějící testy.',
    template: 'reviewer.md',
    permissions: READ_ONLY_GIT,
    steps: 25,
  },
};

// Vestavění agenti OpenCode, kterým jen přepíšeme model (jinak dědí drahý model rodiče).
const BUILTIN_OVERRIDES = { explore: 'scout', general: 'implementer' };

module.exports = { ROLES, BUILTIN_OVERRIDES };
