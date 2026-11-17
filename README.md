# Sunspoke Coast

A desktop browser driving game set in a fictional seaside entertainment district. Drive one midnight-teal Porsche Cayenne SUV through the beach boulevard, hotel streets, and coastal overlook. Every road is available immediately.

Sunspoke County now has **nine districts, 53 connected roads and about 25.8 km of authored road centerlines** across a **3.38 km² bounded play area**. Crown Downtown adds a dense skyline, Canal Gardens has villas and neighbourhood bridges, Southport has working-port scenery, Coast Airfield has a drivable runway and perimeter circuit, and Isla Luz is reached by an elevated causeway. Sierra Verde and Silver Lake add winding northern country roads. The original beachfront, Palm Quarter, Ramp Time compound, Cayenne, beach crowd and smooth driving camera remain part of the county.

Press **M** to open the county atlas. It draws the actual road geometry, coast, districts and car position, with scroll zoom and drag panning. M or Esc returns to the previous driving/pause state. The map screen pauses driving and suspends the hidden 3D rendering.

This is original procedural geography inspired by the city, coast, islands and countryside mix in [Rockstar's official location overview](https://www.rockstargames.com/VI/only-in-leonida). All buildings and scenery are bundled/generated locally.

## Play with a friend

Press **Esc** and use **Play with a friend**, above Visual quality. Choose **Create room**, copy its three-digit code, and let your friend paste it and choose **Join**. You drive the teal Cayenne; your friend drives the coral Cayenne. Both players can explore or enter the beachfront circuit, Silver Lake circuit, airport sprint and Downtown Switchbacks. Downtown Switchbacks adds a 2.26 km lap with 12 rounded corners, roadside chevrons and next-turn/braking guidance. Cars are ghosts to each other. The host chooses a race; both players click **Ready** before the shared countdown.

Multiplayer requires internet access and the online room server. Solo driving remains available offline. See `MULTIPLAYER.md` for race rules, local development and server ownership. The multiplayer server is deployed permanently in the owner's verified Cloudflare account.

## Visual upgrade

The current source and included build add 29 imported CC0 model designs with three detail levels, seven PBR surface sets and three bundled HDR lighting environments. The Cayenne has sculpted body panels, clearer cabin details, brushed wheels, animated steering and brake lights, and the gold **NAREN** hatch signature. Low and higher-detail car GLBs preserve the same dimensions and handling.

The county now has textured grass meadows, imported palms and trees, roadside furniture, additional homes and lakefront towers, terrain foundations, riverbank reeds, district signs, boats, birds and flags. Road improvements include continuous curved asphalt, curbs, shoulders, turn arrows, crossings and reflectors. The gallery has fitted image displays, glass sensor doors and entrance status lights. Static scenery is prebaked locally to avoid rebuilding the entire county during browser startup.

**Release status:** code, build and automated checks pass. The owner authorized GitHub main and Site publication on 17 November 2026 with browser acceptance still pending. Current-build browser screenshots, interaction/audio checks and three five-minute Intel Iris Xe performance drives remain unverified because native browser access was stopped. Earlier screenshots and timings in `TESTING.md` describe older builds. See `IMPLEMENTATION_STATUS.md` for the exact verification boundary.

## Sierra Verde and Silver Lake

Sierra Verde is now a connected hill town with 16 homes, 10 shops/civic venues, a market street, a fountain square, a fuel stop and scenic overlooks. Silver Lake has 13 modern high-rise and sculptural landmarks, lit promenades, palms and a fountain installation. A 56-metre-wide, 1.07 km mountain-fed river flows through the lake toward the eastern sea. The cable-stayed Verde Skyline Bridge links the town and lake district. Roadside lighting now reaches all districts; more than 700 new fixtures join the nearby-light pool without adding hundreds of active point lights.

**NAREN Grand Gallery** stands north of Silver Lake. Its 210 x 140 metre hall has a 24-metre clear interior and a stepped high-rise crown. Drive north on the lake circuit to the straight approach beneath the gallery name. Both entrances have automatic sliding doors: approach normally, and they open for the car. They remain open while the doorway is occupied and close after you leave. Drive through either end or explore the broad interior aisles with the normal controls. No character-exit mode or extra interaction key is required. The atlas marks the gallery and bridge.

Inside are eight locally bundled internet images: four memes and four real photographs. Each display has a title and credit; **Gallery photos & image credits** in the pause menu opens the complete [source and license page](public/gallery/index.html). Full provenance is in `public/gallery/credits.json`. These pictures require no live image service or internet connection when playing the downloaded build.

## Play the included build

1. Extract the ZIP into a folder.
2. Install Node.js 22.12 or newer if it is unavailable on your computer.
3. Double-click **Launch Sunspoke Coast.bat**. The local server opens the game in your default browser.
4. Click **Drive** to start the car and enable audio.

Keep the launcher window open while playing. Close it or press **Ctrl+C** to stop the local server. The server uses `127.0.0.1` and starts on port `4173`, trying the next port when it is occupied. The built game runs from `dist/` and needs no dependency installation or network connection.

You can also start it from a terminal in the extracted folder.

```sh
node scripts/serve.mjs
```

Use `node scripts/serve.mjs --no-open` to start the server without opening a browser automatically. Open the printed URL in a current desktop Chrome or Edge browser with hardware acceleration enabled.

## Controls

**Ramp Time:** drive north from the starting point along the beachfront, then turn toward the beach at the central cross street under the huge gold-and-teal welcome arch. Follow the return lane to the southern run-up, line up with the arrows, and hold W toward the northbound takeoff. Aim for **70+ km/h** at the lip. Clear the 26-metre recessed water channel, land on the far ramp, then use Shift to brake. R recovers a missed jump to the last clear road position. The walled compound has a return lane for repeated jumps; every ordinary city road remains open.

| Input | Action |
| --- | --- |
| W / Up arrow | Accelerate |
| S / Down arrow | Brake, then reverse |
| A and D / Left and right arrows | Steer |
| Shift | Brake without selecting reverse |
| Space | Handbrake |
| R | Return to the last clear road position |
| M | Open or close the county map |
| F2 | Photo mode: orbit, zoom and save a 1920 × 1080 PNG |
| Esc | Pause or resume |
| Mouse drag | Orbit the chase camera |
| Mouse wheel | Zoom |

The camera gently recentres after you stop orbiting. The small pause button also opens the settings. Choose golden hour, twilight, or night, adjust master volume, choose Low, Medium, or High rendering quality, and toggle the controls hint. Speed is displayed in kilometres per hour. The **×** in the driving hint hides it.

The rebuilt keyboard controls blend quick taps into small corrections and held keys into full turns. A single speed-based turning-radius curve keeps parking manoeuvres tight and highway turns responsive. Normal turns preserve forward power. Reverse engages only after braking to a stop and a short neutral dwell. Releasing the handbrake progressively restores grip. The camera gently widens its view as speed increases.

Start with **Low** quality on integrated graphics. Settings apply immediately. Volume, quality, and controls-hint preferences are saved in browser storage when it is available. Each new session begins at golden hour.

| Preset | Resolution scale | Nearby lights | Effects |
| --- | --- | --- | --- |
| Low | 75% | 4 | Contact shadows; reduced grass and model range |
| Medium | 100% | 8 | Sun shadows and soft bloom |
| High | 100% | 12 | Ambient shading and one 512 px lake reflection, updated at up to 8 Hz |

The pause menu includes **Save performance report**. This exports foreground driving frame times, the viewport, internal render size, selected preset, browser identification and asset errors. Open the county map and choose **Save full map** for a full-area PNG. Photo mode pauses vehicle physics and offers mouse orbit and zoom.

## Rebuild or develop

Use Node.js **20.19+** or **22.12+**, with npm. From this project folder run the following commands.

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. Build and launch the production version with these commands.

```sh
npm run build
node scripts/serve.mjs
```

`npm run build` checks TypeScript and creates the complete static game in `dist/`. Before development or a production build, `scripts/bake-world.mjs` refreshes the static county cache when its source fingerprint changes. The source is in `src/`. The project uses TypeScript, Vite, Three.js, and Web Audio. `scripts/serve.mjs` serves the built files with Node's standard library.

## Assets and audio

The car is an original approximation of the Cayenne with an enclosed roof, four doors, four-point headlights and a rear light bar. Its editable Blender source, geometry source and preparation scripts are in `source/assets/car/`; the browser loads bundled GLBs. Geography and landmarks are authored in the project. Imported scenery, textures and lighting environments come from Poly Haven, Kenney and Quaternius under CC0, with creator/source records in `public/assets/manifest.json` and `source/assets/provenance/`. **World assets & credits** in the pause menu opens their bundled credits page. `source/assets/README.md` explains asset preparation and LOD regeneration.

Engine, tire, surf and city ambience use Web Audio synthesis. Playing the included build requires no API keys or external asset services. Audio begins after clicking **Drive**, following browser audio permissions. Reacquiring imported source files is optional and requires internet access. The included built game runs offline. After installing development dependencies with `npm ci`, rebuilding requires no external asset downloads.

The SUV proportions follow Porsche's published Cayenne dimensions. [Porsche technical data](https://download.newsroom.porsche.com/dam/jcr%3Abb376133-788c-4e9c-8e92-9630383cc062/pag-cayenne-td-en.pdf.PDF)

The gallery images retain their individual public-domain, CC0 or CC BY licenses. Credits and original source links are included in `public/gallery/` and `dist/gallery/`.

The bundled Barlow, Baskervville, and Explora fonts use the SIL Open Font License. Their licenses accompany the fonts in `public/fonts/` and `dist/fonts/`. Explora supplies the gold NAREN calligraphy on the rear hatch. Three.js uses the MIT license, included in `public/Three-LICENSE.txt` and `dist/Three-LICENSE.txt`.

## Verification

See `TESTING.md` for current automated results, historical browser measurements and the pending browser acceptance checks. Run the checks with Node.js 22.18 or newer after `npm ci` and `npm run build`.

```sh
node checks/driving-checks.ts
node checks/car-checks.ts
node checks/car-asset-checks.ts
node checks/camera-stability.ts
node checks/world-checks.mjs
node checks/northern-checks.mjs
node checks/landscape-checks.mjs
node checks/visual-checks.mjs
node checks/release-checks.mjs
```

For browser diagnostics, append `?qa=1&routes=1` to the local URL. Route results are written to the hidden `qa-report` JSON element. Add `&view=beach&quality=low&benchmark=1` for a 60-frame completed-render timing sample. Diagnostic views run independently of browser focus so automated screenshots can be captured. The normal game pauses when focus is lost.

Static accounting for this build is approximately **22.9 MB** of initial Low-quality files and **45.9 MB** for the complete built game, below the 25 MB / 120 MB budgets. This is file-size accounting, not a measured browser network waterfall or an FPS result. The ZIP contains source, the complete `dist/`, the Windows launcher and documentation; dependency folders and transient acquisition caches are excluded.
