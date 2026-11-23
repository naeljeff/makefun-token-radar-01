# makefun-token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/naeljeff/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/naeljeff/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it ranks every DeFi protocol that records no token on DefiLlama by an implied token value, priced from the market cap to TVL multiples of the tokens that already trade in its category, adjusted for seven-day TVL growth and how long it has run without a token. Each row carries a costed, timed farm plan, and a static offline dashboard shows the board, a per-protocol valuation and plan, and filters.

The model lives in one file, `dashboard/model.js`, which both `main.ts` (to write `board.json`) and the page (to render) run on the same sealed snapshot, so the board and the screens cannot drift apart. Implied value is this board's own estimate, never a prediction that a token will launch.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
```

Then open `out/dashboard/index.html` in a browser. Node 22.18 or later, standard library only.

---

<sub>Entered on [make.fun](https://make.fun/?ref=pj6ajvm5&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
