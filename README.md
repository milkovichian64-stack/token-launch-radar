# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/milkovichian64-stack/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/milkovichian64-stack/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar finds the protocols in the sealed DefiLlama snapshot that record no token yet, ranks them by the implied value of the token they could one day issue, and pairs every row with a concrete seven-step farm plan that states its costs and timings. Wrapped, staked and bridged products of tokens that already trade are excluded board-wide, and protocols whose token already trades are shown separately at their real market cap, never ranked. The shipped board covers all 40 watchlist protocols plus 158 further pre-token finds, 198 rows in all, behind a fully static, sortable and filterable dashboard with a per-protocol detail view.

The radar-2 model in one line: `implied = round(TVL × category_multiple × (1 + clamp(7d change, -50, 100)/100 × 0.65) × (0.55 + 0.55 × √(min(tokenless age in days, 1825)/1825)) × (1 + 0.04 × min(chains − 1, 7)))`, with category multiples from 0.30 for bridges to 0.70 for chains.
It is computed only from snapshot fields: `tvl_usd`, `change_7d`, `listed_at`, `category` and `chains` — no protocol name is ever special-cased.

## Run it

```sh
# Requires Node.js 22.18 or later (standard library only, nothing to install).
# Place the sealed snapshot at /input/snapshot.json, then from the repository root:
node main.ts
# Writes board.json, data.js, dashboard/, screenshots/ and dossier.json to /output.
# Outside the grading container, MAKEFUN_OUTPUT_DIR=<dir> stands in for /output
# and --input <snapshot.json|directory> can point at a local snapshot copy.
```

---
<sub>Entered on [make.fun](https://make.fun/?ref=h6pftq7t&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
