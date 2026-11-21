# Lobshot

Lobshot is a portrait-friendly 3D cannon game. Drag to aim, fire a clay ball, and smash the jars, pots, bottles, stones, and stacks in a kiln yard. It is an original game: the name, levels, and art are not from Smash Fest or any other title.

Five hand-built levels, five lives a level, coins for every break, and clear or fail cards. Progress stays in `localStorage` on the device. There are no accounts, ads, or servers.

Physics is [cannon-es](https://github.com/pmndrs/cannon-es). Rendering is [Three.js](https://threejs.org/). Both are MIT-licensed dependencies. The pottery, cannon, brick wall, and floor are drawn in code.

## Play

- Drag on the range to aim. The dotted arc is the shot. Release to fire.
- The round **Fire** button looses the current aim. On the first level a shot is already lined up.
- Arrow keys change angle and power. Space or Enter fires.
- Break every glazed piece and every marked stone before you spend five lives.
- Coins from a failed attempt stay on the device. A clear adds a bonus for lives you did not spend.
- Clearing a level unlocks the next one.

## Run locally

Node 20 or newer.

```bash
npm install
npm run dev
```

Vite prints a local URL. On a phone on the same network, use the Network URL (`npm run dev` binds to the host).

```bash
npm test          # replay a known winning shot list for every level
npm run build     # typecheck, replay those shots, write dist/
npm run preview   # serve dist/
```

`npm test` drives the same physics the game uses, headless, and checks that each level can be cleared within five shots. `npm run solve` searches for those shots again after a physics change and rewrites `scripts/solutions.json`.

## Deploy on Vercel Hobby

The app is a static Vite build. No environment variables.

1. Merge this branch to `main`.
2. In Vercel, import the GitHub repository.
3. Framework preset: **Vite**. Root directory: the repository root.
4. Build command: `npm run build`. Output directory: `dist`. [`vercel.json`](vercel.json) sets both.
5. Deploy. The Hobby plan serves the `dist/` folder as a static site.

`vite.config.ts` uses `base: './'`, so the built files also load from a nested path or from a later Capacitor web view.

## iPhone Safari and home screen

- The layout is a tall alley. Portrait fills the screen. Landscape keeps the same alley with kiln wall to either side.
- Aiming uses pointer events, so touch and mouse share one path. The page sets `touch-action: none` and `viewport-fit=cover`.
- The renderer caps the pixel ratio (1.5 on coarse pointers) and uses a 512px shadow map on touch devices.
- If WebGL is missing, the page shows a short message instead of a blank canvas.
- `manifest.webmanifest`, `theme-color`, `apple-mobile-web-app-capable`, and the apple touch icon are included, so Safari’s Share sheet can **Add to Home Screen**. The installed icon opens the game full screen. There is no service worker, so the first load still needs a network and an update cannot get stuck in an old cache.

## Wrapping as an iOS app later

The simulation in `src/game/sim.ts` does not touch the DOM. Input, drawing, and save/load sit around it. A Capacitor shell can point `webDir` at `dist/` without a backend:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios
npx cap init Lobshot com.example.lobshot --web-dir dist
npx cap add ios
```

## Layout

```
index.html              PWA metadata and the canvas shell
src/game/sim.ts         cannon-es world, breaks, debris
src/game/levels.ts      five levels
src/game/stage.ts       Three.js scene
src/game/Game.ts        aim, lives, coins, screens
src/game/storage.ts     localStorage save
public/                 manifest and icons
scripts/simulate.ts     proves each level is clearable
vercel.json             static build settings
```

## Limits

- This repo was checked in desktop Chrome, including a tall window and a wide one, not on a physical iPhone.
- The coin bank grows on the first clear of a level. A replay can raise the best round, and it leaves the bank as it is.
- Shot outcomes depend on the fixed physics step. After changing cannon-es or the tuning numbers, run `npm run solve` and commit the new `scripts/solutions.json`.
