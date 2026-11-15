# Sunspoke Coast

A desktop browser driving game set in a fictional seaside entertainment district. Drive one midnight-teal Porsche Cayenne SUV through the beach boulevard, hotel streets, and coastal overlook. Every road is available immediately.

Sunspoke County now has **nine districts, 43 connected roads and about 22.4 km of authored road centerlines** across a **3.38 km² bounded play area**. Crown Downtown adds a dense skyline, Canal Gardens has villas and neighbourhood bridges, Southport has working-port scenery, Coast Airfield has a drivable runway and perimeter circuit, and Isla Luz is reached by an elevated causeway. Sierra Verde and Silver Lake add winding northern country roads. The original beachfront, Palm Quarter, Ramp Time compound, Cayenne, beach crowd and smooth driving camera remain part of the county.

Press **M** to open the county atlas. It draws the actual road geometry, coast, districts and car position, with scroll zoom and drag panning. M or Esc returns to the previous driving/pause state. The map screen pauses driving and suspends the hidden 3D rendering.

This is original procedural geography inspired by the city, coast, islands and countryside mix in [Rockstar's official location overview](https://www.rockstargames.com/VI/only-in-leonida). All buildings and scenery are bundled/generated locally.

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
| Esc | Pause or resume |
| Mouse drag | Orbit the chase camera |
| Mouse wheel | Zoom |

The camera gently recentres after you stop orbiting. The small pause button also opens the settings. Choose golden hour, twilight, or night, adjust master volume, choose Low, Medium, or High rendering quality, and toggle the controls hint. Speed is displayed in kilometres per hour. The **×** in the driving hint hides it.

The rebuilt keyboard controls blend quick taps into small corrections and held keys into full turns. A single speed-based turning-radius curve keeps parking manoeuvres tight and highway turns responsive. Normal turns preserve forward power. Reverse engages only after braking to a stop and a short neutral dwell. Releasing the handbrake progressively restores grip. The camera gently widens its view as speed increases.

Start with **Low** quality on integrated graphics. Low renders at up to 75% display resolution with dynamic shadows and bloom disabled. Medium and High enable shadows and bloom and increase rendering resolution or shadow quality. Settings apply immediately. Volume, quality, and controls-hint preferences are saved in browser storage when it is available. Each new session begins at golden hour.

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

`npm run build` checks TypeScript and creates the complete static game in `dist/`. The source is in `src/`. The project uses TypeScript, Vite, Three.js, and Web Audio. `scripts/serve.mjs` serves the built files with Node's standard library.

## Assets and audio

The Cayenne model, buildings, landscaping, beach, ocean, and material textures are generated procedurally in the project. The car is an original approximation of the Cayenne with an enclosed roof, four doors, four-point headlights, and a rear light bar. Engine, tire, surf, and city ambience use Web Audio synthesis. These systems require no secret keys, paid services, or runtime asset downloads. Audio begins after clicking **Drive**, following browser audio permissions.

The SUV proportions follow Porsche's published Cayenne dimensions. [Porsche technical data](https://download.newsroom.porsche.com/dam/jcr%3Abb376133-788c-4e9c-8e92-9630383cc062/pag-cayenne-td-en.pdf.PDF)

The bundled Barlow, Baskervville, and Explora fonts use the SIL Open Font License. Their licenses accompany the fonts in `public/fonts/` and `dist/fonts/`. Explora supplies the gold NAREN calligraphy on the rear hatch. Three.js uses the MIT license, included in `public/Three-LICENSE.txt` and `dist/Three-LICENSE.txt`.

## Verification

See `TESTING.md` for the measured render timings, driving checks, screenshot review, and verification limits. Run the focused driving and camera checks with Node.js 22.18 or newer.

```sh
node checks/driving-checks.ts
node checks/car-checks.ts
node checks/camera-stability.ts
node checks/world-checks.mjs
```

For browser diagnostics, append `?qa=1&routes=1` to the local URL. Route results are written to the hidden `qa-report` JSON element. Add `&view=beach&quality=low&benchmark=1` for a 60-frame completed-render timing sample. Diagnostic views run independently of browser focus so automated screenshots can be captured. The normal game pauses when focus is lost.
