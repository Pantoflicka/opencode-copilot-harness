# opencode-copilot-harness

Sada agentů pro [OpenCode](https://opencode.ai), která s předplatným **GitHub Copilot** volí modely tak, aby se zbytečně neprojídaly AI kredity.

Od 1. června 2026 Copilot neúčtuje „prémiové požadavky“, ale skutečně spotřebované tokeny v **AI kreditech** (1 kredit = 0,01 USD). Ceny tokenů se mezi modely liší až stonásobně: typický krok agenta s GPT-6 Luna stojí zhruba 0,15 kreditu, s Claude Opus 5.5 přes 5 kreditů. Největší úspora proto není v tom, který „nejlepší“ model si vyberete, ale v tom, **aby drahý model nečetl soubory, nehledal v kódu a nedělal rutinu**.

## Jak to funguje

Nástroj spustí `opencode models github-copilot`, zjistí, které modely vám Copilot v OpenCode opravdu nabízí, a pro každou roli vybere nejvhodnější dostupný model podle zvoleného profilu. Pak vygeneruje agenty:

| Agent | Typ | Na co | Typický model (profil úspora) |
|---|---|---|---|
| `copilot` | hlavní, výchozí | řídí práci, malé úpravy dělá sám, zbytek deleguje | GPT-6.1 Sol / Claude Sonnet 5.5 |
| `quick` | hlavní | rychlé dotazy a drobné úpravy za pár haléřů | GPT-6 Luna / Claude Haiku 5.5 |
| `scout` | subagent, jen čtení | hledá v kódu a na webu, vrací stručný report | GPT-6 Luna / Claude Haiku 5.5 |
| `implementer` | subagent | provede jasně zadanou změnu a spustí testy | Claude Sonnet 5.5 |
| `architect` | subagent, jen čtení | návrh, těžké chyby, rozhodnutí | Claude Opus 5.5 (vyvážený, výkon) |
| `reviewer` | subagent, jen čtení + git | recenze diffu modelem **jiného výrobce** než implementer | GPT-6.1 Sol |

Navíc přepíše model vestavěných agentů `explore` a `general`, které jinak dědí (drahý) model hlavního agenta, a nastaví `copilot` jako výchozího agenta. Subagenti běží ve vlastním čistém kontextu, takže co přečte levný scout, nenafukuje kontext drahého modelu.

Podporuje **OpenCode 2.x** (nový formát `agents`/`permissions`) i **1.x** (`agent`/`permission`), verzi pozná sám.

## Požadavky

- Node.js 18.17 nebo novější
- OpenCode s připojeným GitHub Copilotem (v OpenCode příkaz `/connect` → GitHub Copilot)

## Instalace

Přímo z GitHubu (nahraďte `UZIVATEL` svým účtem):

```powershell
npx github:UZIVATEL/opencode-copilot-harness install --profile uspora
```

Nebo naklonovat a spustit lokálně:

```powershell
git clone https://github.com/UZIVATEL/opencode-copilot-harness.git
cd opencode-copilot-harness
node bin/och.js install --profile uspora
```

Agenti se standardně zapíšou globálně do `%USERPROFILE%\.config\opencode\agents` (na macOS/Linuxu `~/.config/opencode/agents`). Pro jeden projekt použijte `--scope project`.

Nejdřív si můžete prohlédnout, co by se stalo:

```powershell
node bin/och.js install --profile vyvazeny --dry-run
```

## Profily

| Profil | Pro koho | Rozdíl |
|---|---|---|
| `uspora` | Copilot Pro, malý měsíční příděl | nikde Opus, architekt i hlavní agent na středních modelech |
| `vyvazeny` | Pro i Pro+ | hlavní agent Sonnet 5.5, architekt Opus 5.5, pokud je dostupný |
| `vykon` | Pro+ / Max | hlavní agent Opus 5.5, architekt Opus nebo GPT-6 Astra |

Když model z profilu na vašem plánu chybí, vezme se další kandidát v pořadí. Pokud OpenCode model vypíše, ale váš plán ho ve skutečnosti nepovolí, pomůže volba `--verify`: každý vybraný model dostane krátký testovací dotaz (stojí zlomek kreditu) a nefunkční se přeskočí.

## Příkazy

```text
och install   [--profile uspora|vyvazeny|vykon] [--scope global|project] [--verify] [--dry-run] [--force]
och models    tabulka modelů, cen, odhadu kreditů na krok a dostupnosti
och doctor    verze OpenCode, dostupné modely, co je nainstalováno, co chybí v katalogu
och uninstall smaže vytvořené agenty a vrátí původní hodnoty v opencode.json
```

Další volby: `--refresh` (obnoví seznam modelů v OpenCode), `--offline` (bez spuštění OpenCode), `--models-file <soubor>`, `--opencode-version <x.y.z>`, `--config-dir <cesta>`, `--project-dir <cesta>`.

## Používání v OpenCode

- Klávesou **Tab** přepínáte mezi `copilot` a `quick`. Na drobnosti používejte `quick`.
- Subagenty můžete zavolat i ručně: `@scout najdi, kde se ověřuje přihlášení`, `@architect …`, `@reviewer zkontroluj moje změny`.
- `copilot` má v instrukcích, kdy delegovat, takže většinu práce rozdělí sám.

## Bezpečnost vaší konfigurace

- Před úpravou `opencode.json` se vytvoří záloha `opencode.json.bak-<datum>`.
- Konfiguraci s komentáři (`opencode.jsonc`) nástroj **nemění**; vytvoří vedle ní `opencode.copilot-harness.json` s úryvkem k ručnímu vložení.
- Existující soubor agenta se stejným jménem, který nevytvořil tento nástroj, se nepřepíše bez `--force`.
- Co bylo nainstalováno, je zapsané v `.copilot-harness.json`; podle toho `och uninstall` vše vrátí.

## Aktualizace cen a modelů

Ceny a modely se mění často. Vše je v datových souborech, kód není potřeba měnit:

- `catalog/models.json` – ceny za 1M tokenů podle [Models and pricing for GitHub Copilot](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing)
- `catalog/profiles.json` – pořadí kandidátů pro každou roli a profil
- `templates/*.md` – instrukce jednotlivých agentů (anglicky, šetří tokeny; odpovídají v jazyce uživatele)

`och doctor` vypíše modely, které Copilot nabízí, ale v katalogu ještě nejsou. Po úpravě spusťte `npm test` a `och install` znovu; vlastní soubory se přepíšou automaticky.

Odhad „kreditů na krok“ počítá s typickým krokem agenta: 40K tokenů kontextu, z toho 90 % z cache, a 1,5K tokenů výstupu. Je to orientační srovnání modelů, ne přesný účet.

## Licence

MIT
