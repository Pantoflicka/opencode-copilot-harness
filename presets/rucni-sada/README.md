# Sada konfigurace OpenCode 2 pro GitHub Copilot

Konfigurace zaměřená na úsporu AI kreditů: jeden hlavní model na plánování i stavbu, levné modely pro subagenty.

## Instalace (Windows)

1. Zálohujte složku `%USERPROFILE%\.config\opencode`.
2. Soubory z této složky do ní zkopírujte tak, aby vznikla tato struktura:

```
%USERPROFILE%\.config\opencode\
  opencode.jsonc
  AGENTS.md
  agents\explore.md
  agents\review.md
  agents\agent-test.md
  commands\review.md
  commands\test-agent.md
```

Pokud už máte `opencode.json`, nenechávejte vedle něj `opencode.jsonc`. Sloučte je do jednoho souboru.

Chcete-li sadu jen pro jeden projekt, dejte `AGENTS.md` do kořene repozitáře a složky `agents` a `commands` do `.opencode\`.

## Rozdělení modelů

| Agent | Model | Cena za 1M tokenů (vstup / výstup) |
|---|---|---|
| plan, build | GPT-6.2 Sol | 2 $ / 10 $ |
| explore, title | GPT-6 Luna | 0,10 $ / 0,50 $ |
| review, agent-test | Claude Haiku 5.5 | 0,10 $ / 0,50 $ |

Ceny jsou z ceníku GitHub Copilot k 23. 11. 2026.

GPT-6.2 Sol je v Copilotu jen pro tarify Pro+, Max, Business a Enterprise. Na tarifu Pro ho v `opencode.jsonc` nahraďte za `github-copilot/claude-sonnet-5.5` a blok `providers` smažte.

## Po prvním spuštění ověřte

1. Všechna ID modelů jsou ve výběru modelů. `gpt-6-luna` je odvozené ze vzoru názvů.
2. Ukazatel kontextu u GPT-6.2 Sol ukazuje strop 250K.
3. Agenti `explore`, `review` a `agent-test` jsou v seznamu agentů.
4. Příkazy `/review` a `/test-agent` se nabízejí.
5. `/usage` po jednom běžném úkolu ukáže skutečnou spotřebu kreditů.

## Co není ověřené

Sada nebyla spuštěna v OpenCode, ověřena je jen platnost JSON. První start berte jako test.

## Použití

- `build` na běžnou práci, `plan` na návrh.
- Model uprostřed sezení neměňte. Na jiný model začněte nové sezení.
- `/review` zkontroluje neodeslané změny.
- `/test-agent agents/muj-agent.md "scénář"` vyzkouší agenta na levném modelu.
