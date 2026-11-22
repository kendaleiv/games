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

## Publishing

Set **Settings → Pages → Source** to **GitHub Actions**. The [deployment workflow](./.github/workflows/deploy.yml) runs on pushes to `main` or can be started manually from the Actions tab. Each platformer suite runs in its own independent job, so a failure in one does not prevent the other from running. Deployment requires both to pass, runs the other two games' suites, then stages the menu and the files the games serve into `_site/` and deploys a single Pages artifact. Tests, package metadata, and nested workflows are not part of the published site. The menu uses relative links so it works under `/games/`.