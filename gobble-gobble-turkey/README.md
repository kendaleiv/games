# Gobble Gobble Turkey 🐷🦃

A browser-based auto-running race! Jump over holes to help a speedy pig beat a stack of turkeys to the golden key.

**[▶️ Play Now](https://kendaleiv.github.io/gobble-gobble-turkey/)** — no download required!

## How to Play

1. Tap or click the game, or press **SPACE** or **ENTER**, to start the countdown
2. The pig runs automatically. Tap, click, or press **SPACE** or **ENTER** to jump just before a hole; no holding or repeated tapping to run is needed
3. Each press triggers one jump; you must land before jumping again. If the pig falls into a hole, it slows down and climbs out automatically
4. Reach the golden key before the turkeys
5. Tap, click, or press **SPACE** or **ENTER** on the results screen to race again
6. Use the fullscreen button in the top-right (or press **F**) for a mobile-friendly view

The game has one level with seven holes to jump over and works on desktop and mobile.

## Running Locally

Open `index.html` in a modern browser:

```sh
open index.html
```

Or use any static file server:

```sh
npx serve .
```

## Tests

Run the gameplay tests with Node.js (no dependencies required):

```sh
node --test tests/game.test.cjs
```

The suite checks controls, hole recovery, wins, replay, and display rates. Per-hole timing measurements are informational, without fixed slack targets. See [test coverage and reports](../README.md#playability-and-difficulty-coverage).

## License

[MIT](LICENSE)