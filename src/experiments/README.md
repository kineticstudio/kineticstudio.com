# Experiments

One file per live experiment on the Playground: `src/experiments/<slug>.js`.
The slug matches its entry in `src/data/experiments.js`. Every experiment
opens on its own page (`/playground/<slug>`) with a Params panel beside it;
`/lab/<slug>` is the same thing with no site chrome, for building one.

## The contract

```js
// src/experiments/<slug>.js

/** The dials, in the Creative Studio's ks-params shape (see src/scripts/params.js). */
export const params = {
  count: [12, 1, 40, 1],                 // slider: [value, min, max, step]
  glow: true,                            // on / off
  ink: "#a8ff66",                        // colour
  mode: { type: "select", options: ["Waves", "Spiral"] },
  motion: { speed: [1, 0, 4, 0.01] },    // a group: the value's path is "motion.speed"
  shuffle: { type: "action", label: "Shuffle" },
};

/**
 * Start the experiment inside `host` (an empty, positioned element that
 * fills the stage). `values` is flat, keyed by path. Return the handle.
 */
export function mount(host, values, ctx) {
  // ctx.reducedMotion: true when the visitor asked for less motion
  return {
    update(values, path) {},   // a dial moved (path null = everything changed)
    action(name) {},           // an action button was pressed
    destroy() {},              // leave nothing behind: RAF, listeners, GL context
  };
}
```

## Rules

- **Self-contained.** No imports from other experiments or site components.
  `three` and `gsap` are installed and may be imported.
- **Fills the host, follows its size.** Use a `ResizeObserver` on `host`.
  Cap the device pixel ratio at 2.
- **Costs nothing when nobody is looking.** Pause the loop while the tab is
  hidden or the host is off screen (`IntersectionObserver`).
- **Reduced motion:** draw a settled frame and only redraw when a dial moves.
- **Every dial does something visible.** 5 to 10 of them; group them.
- **The Kinetic palette by default:** ground `#0d0d0d`, sage `#d9e2d2`,
  lime `#a8ff66`, ink `#191919`. Colour dials may move away from it.
- **Pointer is a bonus, never required.** The piece must look alive untouched.
- No text in the canvas unless the experiment is about type.
