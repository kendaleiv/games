# Games

Three browser games in one place. Choose a game from the [GitHub Pages menu](https://kendaleiv.github.io/games/).

- [Gobble Gobble Turkey](./gobble-gobble-turkey/) — Help a speedy pig jump over holes and beat the turkeys to the golden key.
- [Grass Adventure](./grass-adventure/) — Explore a top-down pixel-art world inspired by a child's dictated adventure.
- [Porcupine Spikey — Cave Adventure](./porcupine-spikey/) — Choose a character and platform through underground caves.

Each folder preserves the original game's files, including its README, license, and any tests. The nested workflows are kept for reference; only the root workflow runs here.

## Play and test locally

From the repository root, run `python3 -m http.server 8000` and open <http://localhost:8000/>.
No build or package installation is required. To run the included tests with Node.js 22 (the version used in CI):

```sh
(cd gobble-gobble-turkey && node --test tests/game.test.cjs)
(cd grass-adventure && npm test)
```

Porcupine Spikey does not include an automated test suite.

## Publishing

Set **Settings → Pages → Source** to **GitHub Actions**. The [deployment workflow](./.github/workflows/deploy.yml) runs on pushes to `main` or can be started manually from the Actions tab. It runs both test suites, then stages the menu and the files the games serve into `_site/` and deploys a single Pages artifact. Tests, package metadata, and nested workflows are not part of the published site. The menu uses relative links so it works under `/games/`.