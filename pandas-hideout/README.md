# Panda's Hideout

A standalone adaptation of Porcupine Spikey with one entirely new bamboo rainforest level. Play as a **panda** (the default), a **skunk**, or a **pig**. All three characters have identical abilities.

Choose a character with the arrow keys or by clicking/tapping its card, then select **Play Rainforest** or press **Enter**. Your character automatically runs forward. Press **Space**, click, or tap to jump onto mossy branch platforms, cross stream gaps, and avoid creatures. Stomp beetles, frogs, boars, and laser sentries to defeat them; lasers themselves cannot be stomped. Sentries flash a warning before firing.

Reach the bamboo hideout to win. After a short pause on defeat, press **Space**, **Enter**, or tap to retry. **Esc** or the menu button returns to character selection; the top-right button toggles fullscreen.

The level keeps the original first level's 6,400-unit length, movement speed, gravity, jump strength, 20 floating platforms, 16 enemies, and five gaps (four 80-unit gaps and one 160-unit gap). Four slow laser sentries replace the original projectile throwers rather than adding extra enemies. Sentries sit farther beyond preceding obstacles to give you breathing room before their beams arrive. Branches over the stream and a long safe opening keep the challenge introductory.

Open `index.html` directly, or serve the repository with `python3 -m http.server 8000` and visit `/pandas-hideout/`. No build or dependencies are required.

Run the tests from the repository root:

```sh
node --test pandas-hideout/tests/game.test.cjs
```

This game's independent suite covers movement, collision, restart, completion, fixed-timestep behavior, character selection, input methods, the rainforest obstacle budget, laser warnings, and an uninterrupted winning route for all three characters. It does not load or compare against another game. Only the browser-simulation harness is shared infrastructure; gameplay expectations belong to this suite.
