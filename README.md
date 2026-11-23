# Games

Four browser games in one place. Choose a game from the [GitHub Pages menu](https://kendaleiv.github.io/games/).

- [Gobble Gobble Turkey](./gobble-gobble-turkey/) — Help a speedy pig jump over holes and beat the turkeys to the golden key.
- [Grass Adventure](./grass-adventure/) — Explore a top-down pixel-art world inspired by a child's dictated adventure.
- [Porcupine Spikey — Cave Adventure](./porcupine-spikey/) — Choose a character and platform through underground caves.
- [Panda's Hideout](./pandas-hideout/) — Play as a panda, skunk, or pig in one introductory bamboo rainforest level with platforms and lasers.

Each folder preserves the original game's files, including its README, license, and any tests. The nested workflows are kept for reference; only the root workflow runs here.

## Play and test locally

From the repository root, run `python3 -m http.server 8000` and open <http://localhost:8000/>.
No build or package installation is required. To run the included tests with Node.js 22 (the version used in CI):

```sh
(cd gobble-gobble-turkey && node --test tests/game.test.cjs)
(cd grass-adventure && npm test)
node --test pandas-hideout/tests/game.test.cjs
node --test porcupine-spikey/tests/game.test.cjs
```

Porcupine Spikey and Panda's Hideout have independent test suites and game-specific expectations. Only the browser-simulation harness in `test/platformer-harness.cjs` is shared infrastructure; neither suite loads or compares against the other game. Keep gameplay regression tests local to each game as they evolve.

## Playability and difficulty coverage

Tests cover full input-driven wins with hazards intact, controls, collisions, progression, saves, retries, and display-rate behavior. They do not enforce fixed obstacle counts, identical end scores, or difficulty budgets. Winning scripts are test fixtures, not required player strategies; update them when intentionally changing a level.

Timing slack is **informational**, not a pass/fail difficulty target. Route sweeps vary one input at a time and record the contiguous successful range around its baseline; the isolated lightning test records its longest successful range. Slack is the time between the earliest and latest successful inputs, so a single successful frame has zero slack. Bounded sweeps can report lower bounds. These simulations do not replace human/device playtesting or establish subjective difficulty.

CI runs the gameplay tests without generating or uploading difficulty reports. Optional local JSON reports include revision/source hashes, route metadata, input locations, frames, milliseconds, and slack. Grass Adventure also reports duration and actual damage separately from healing. Missing records or `null` windows indicate incomplete measurement. Reports are not committed or published with the games.

To generate a local report:

```sh
export GAME_TEST_REVISION="$(git rev-parse HEAD)"
GAME_TEST_REPORT="$PWD/.test-results/pandas-hideout.json" node --test pandas-hideout/tests/game.test.cjs
```

Use the corresponding game/test path for another suite. Without `GAME_TEST_REPORT`, tests do not write files. Local revisions are `null` unless supplied through `GAME_TEST_REVISION`. Milliseconds describe simulation time, not device input latency.

## Publishing

Set **Settings → Pages → Source** to **GitHub Actions**. The [build, test, and deployment workflow](./.github/workflows/deploy.yml) runs on pull requests targeting `main`, pushes to `main`, or manually from the Actions tab. A single job runs all four games' independent test suites, stages the menu and the files the games serve into `_site/`, and uploads one deployable Pages artifact. The remaining suites still run if another fails, but artifact preparation and deployment require all tests to pass. Pull requests build and test without publishing to Pages; pushes and manual runs also build and test, then deploy the artifact in the same job. The job uses the `pull-request` environment for pull requests and the `github-pages` environment for pushes and manual runs. Pages deployment steps are skipped on pull requests, and fork pull requests receive read-only repository permissions. Tests, package metadata, and nested workflows are not part of the published site. The menu uses relative links so it works under `/games/`.