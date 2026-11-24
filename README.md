# makefun-token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/naeljeff/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/naeljeff/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it ranks every DeFi protocol that records no token on DefiLlama by an implied token value, launch value × token odds. Launch value is fitted on the 118 tokens that already trade (market cap against TVL size, age and the other snapshot figures), and token odds on the record of 383 peers that do or do not carry a token. Each candidate term is kept only if it lowers the held-out miss both leave-one-out and walk-forward, and the page prints those tests, the printed ranges' coverage and bootstrap rank ranges. Each row carries a costed, timed farm plan with a net-of-fees verdict, and a static offline dashboard shows the board, a per-protocol valuation and plan, and filters.

The model lives in one file, `dashboard/model.js`, which both `main.ts` (to write `board.json`) and the page (to render) run on the same sealed snapshot, so the board and the screens cannot drift apart. Implied value is this board's own estimate, never a prediction that a token will launch.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
```

Then open `out/dashboard/index.html` in a browser. Node 22.18 or later, standard library only. `node test/model.test.mjs path/to/snapshot.json` checks the model.

---

<sub>Entered on [make.fun](https://make.fun/?ref=pj6ajvm5&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
