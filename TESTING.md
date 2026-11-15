# Sunspoke Coast verification

## Sierra Verde, modern Silver Lake and drive-in gallery - 15 November 2026

The northern development adds 16 homes, 10 shops/civic venues and 13 lakefront towers/sculptural landmarks. There are 739 new roadside fixtures and 869 total lighting source locations, served by the existing four nearby point lights. The Verde River is 56 metres wide and 1,075 metres long, descending through Silver Lake to the eastern sea. Water surfaces have local elevations rather than the ocean datum, and crossing decks clear the river. The cable-stayed bridge has two 48-metre pylons and illuminated rails. The gallery hall measures 210 x 140 metres with 24 metres of clear headroom. Eight downloaded images are locally bundled with sources, authors and licenses; all image files and attribution records are checked.

Door sensors, animation and occupancy holds run at the same fixed 60 Hz step as the vehicle. The four door panels expose live collision volumes to both the car and the camera, while overhead walls and roof volumes use explicit elevations. Tests confirm physical obstruction while closed, complete opening within 0.9 seconds, remaining open during ten seconds of doorway occupancy, and closure after the car leaves. The car traverses both entrances and the hall in both directions, with matching 30/60/120 Hz results. Camera orbit stays below the roof at multiple angles. Rendering without advancing the simulation preserves door state. Reset can record a clear position inside the hall despite the roof overhead.

The current county has 53 connected roads and 25,846 metres of authored centerlines. All 22,467 lane probes pass. Ten continuous test-driver circuits pass, including the new village loop. Ten additional continuous traversals pass: both directions across the main bridge, lakefront promenade, gallery approach, interior drive and northern approach. All 392 terrain/underlay ray samples are clear. Existing 23 driving/camera checks, 60-165 Hz presentation stability, Cayenne geometry and Ramp Time jump checks pass. TypeScript and production build pass. The local production server returned successful responses for the game page, credits page, all eight images, JavaScript and CSS. Run `node checks/northern-checks.mjs` for the new sensor, gallery, bridge and lighting checks.

Browser control still fails with `GetCursorPos failed: Access is denied. (0x80070005)`. Consequently, current-build rendered views in golden hour/twilight/night, browser audio/console capture, interactive map/credits-link behavior and sustained FPS on Intel Iris Xe remain unverified. Lighting-setting tests exercise world updates but do not certify rendered appearance. The new county overview is generated from actual road/geography data and is not an in-game screenshot. Earlier browser results below apply only to those older builds.

## GTA-inspired county expansion - 15 November 2026

Added an original coastal county with nine districts, 43 authored roads, 22,434 metres of road centerlines and a 3,380,960-square-metre bounded play area. The county includes a downtown grid, a freeway circuit, canals, a port, an airfield, an island causeway, hills and a lake. The original beachfront, Cayenne, Ramp Time and adult beach crowd remain. M opens a map drawn from the actual roads and geography; driving pauses and hidden 3D rendering stops while it is open. New installations default to Low quality; saved preferences are retained.

Deterministic world checks confirm all 43 roads connect to the starting network, all 19,437 lane-clearance probes pass, and nine continuous test-driver loops complete. Another 338 downward-ray samples verify that terrain and sidewalk underlays do not cover road centerlines. The tests include the original four circuits plus the freeway, lake, airfield, island and port circuits. These checks simulate keyboard driving and inspect geometry; they are not manual browser laps. The ramp jump retains its measured 25.26 m/s launch, 7.16 m peak and 1.75-second airtime.

All 23 driving/camera checks, the 60-165 Hz camera stability checks, car geometry checks and strict TypeScript/production build checks pass. The new map retains spatial instance batches for distant scenery. The supplied county overview is generated from actual world geometry, not a browser screenshot.

Current-build browser visual inspection, M-key interaction, audio response, console capture and sustained FPS measurement could not be completed: browser control failed with the Windows error `GetCursorPos failed: Access is denied. (0x80070005)`. In particular, the expanded county is not verified at 30 FPS on Intel Iris Xe. Earlier browser screenshots and performance results below refer to their respective earlier builds and must not be treated as validation of this expansion.

## Driving camera shake — 15 November 2026

Reproduced a presentation timing bug: the car and camera rendered the latest 60 Hz physics pose directly, repeating positions between fixed steps on faster displays. The camera's position was damped while its aim jumped to each new physics pose, visibly shaking static scenery. Physics state is now retained at both sides of the most recent fixed step and interpolated using the remaining simulation time. Car position, pitch, steering visuals, chase-camera aim, field of view and following lights use the same interpolated state. Steering, grip, acceleration, collision and jump simulation equations are unchanged. Reset and external pose changes clear interpolation history; heading interpolation follows the short arc across ±π.

The camera regression test drives the real Driving/ChaseCamera pair on unobstructed flat ground. During the final second of a warmed-up straight-line run at 144 Hz, the previous rendering repeated **83 poses** and measured **0.38680557° RMS frame-to-frame camera angular second difference**. The corrected rendering repeats **zero poses** and measures **0.00001438°** on the same run. At 90, 120 and 165 Hz, corrected RMS values are 0.00001655°, 0.00002624° and 0.00001304°. All fixed-rate cases, a variable-frame-time sequence, paused rendering, reset, teleport and heading-wrap checks pass. These are deterministic camera-motion measurements, not browser FPS measurements.

The live visual check also found that the new compound's raised ground height was being sampled by background terrain and the road's sidewalk underlay, causing light surfaces to project over the boulevard beside the compound. Background terrain and road strips now sample the original coastal height field; the compound keeps its separate floor and collision surfaces. A downward-ray regression checks five road positions beside the compound and verifies terrain and sidewalk underlays stay below the asphalt. Both overlap cases failed the regression before correction and pass afterward.

All 23 existing driving/camera checks, car geometry checks, jump tests, 3,477 road probes and four continuous road loops still pass. The jump's measured takeoff, peak height, airtime and landing values are unchanged. Chrome production-build checks confirmed high-speed steering, reset and pause/resume, with no captured console errors. Browser scheduling remains variable; the high-refresh stability result above comes from the deterministic regression. Run it with `node checks/camera-stability.ts`.

## Ramp Time stunt compound — 15 November 2026

Added a walled stunt compound at the central city/beach junction, with an approximately 25-metre-tall gold-and-teal welcome arch named RAMP TIME. A 5-metre takeoff ramp launches over a 26-metre recessed water channel to a wide landing ramp and braking apron. An open city-side gateway and return lane allow entry and repeated attempts. Original beach props and visitors were moved out of the compound, retaining all 84 adult beachgoers on the surrounding public beaches. Compound lamps join the existing nearby-light pool, and arch illumination follows the lighting setting.

The car now has vertical velocity, gravity, airborne pitch and landing state. Ramp ascent supplies launch velocity. Airborne tire steering and braking cannot change horizontal momentum. Elevation-aware collisions let the car clear the landing lip while catching an undershoot. A tall ramp face cannot lift a grounded car onto its top. Reset clears flight state, and the chase camera clears ramp surfaces. Existing road handling remains covered by all 23 driving/camera checks.

The deterministic jump test accelerates from rest at the southern run-up, launches at **25.26 m/s (90.95 km/h)**, reaches **7.16 m** above the compound's datum, remains airborne for **1.75 s**, lands on the far ramp, and brakes to a stop inside the compound. A slow attempt lands in the recessed gap and recovers with R. Tests also verify city-side gateway access, the absence of tire forces in midair, and matching results at 30 and 120 Hz input frequencies. All **3,477 road probes** and **four continuous road loops** still pass. Car geometry and strict TypeScript/production build checks pass.

Browser inspection confirmed the arch lettering and daylight/night appearance, the visible water gap, and a car physically airborne over it. The diagnostic `?qa=1&view=jump&capture=1` advances the actual Driving simulation from rest to the middle of the jump, then holds that state for visual inspection; it does not substitute an artificial car position. Normal gameplay is never frozen. Console error capture was empty. Current-update sustained gameplay FPS was not remeasured; older timing sections describe their respective builds.

## Expanded city and rebuilt controls — 15 November 2026

The bounded city footprint grows from 202,120 to 303,180 m², exactly 1.5×. The original coastline and landmarks remain at their authored positions. Palm Quarter adds an inland boulevard, three connectors, twelve buildings, six fountain courts, palms, lamps, and a moved eastern perimeter. Nine authored roads total approximately 4,025 m of centerline. Adult beachgoers use instanced geometry: 84 adults, including 21 walkers, with bikinis, thong swimsuits, swim shorts, sunglasses, and reclining poses.

The driving model has been rebuilt. Digital steering ramps into an analog input, short taps remain small, countersteering crosses centre quickly, and one continuous radius curve governs city and highway turns. Yaw responds with damping. Acceleration retains power in ordinary turns, momentum is conserved during coasting, direction changes brake to a stop with a 0.18-second neutral dwell, and handbrake grip recovers progressively. Shift is a dedicated service brake. Collision recovery temporarily preserves tangent motion for glancing contact. The chase camera widens from 55° to 62° at speed. The main loop now delegates fixed-step accumulation to Driving rather than accumulating twice.

All **23 driving/camera checks**, car geometry checks, and world checks passed. **3,477 lane probes across all nine roads** passed with no blocked probes. Continuous keyboard-input test drivers completed the original outer loop (1,566 m), original inner loop (871 m), Palm Quarter loop (947 m), and expanded outer loop (1,892 m). These are deterministic simulation checks, rather than claims of manual laps. The new world check is included in the source ZIP and runs with `node checks/world-checks.mjs`.

Chrome browser checks confirmed high-speed A input changes heading, Escape pauses with W held, resume clears input, and R returns the car to its last clear road position. Beachfront, casino approach, headland, and Palm Quarter were inspected in golden hour, twilight, and night. Beach crowd placement was inspected in a close beach view. Console error capture was empty. The existing audio synthesis is unchanged.

### Performance measurement and limit

Measured in Chrome on Intel Iris Xe (ANGLE / Direct3D 11), at a **1920×1080 display viewport on Low**, with **1440×810 internal rendering**. Low now disables dynamic shadows and bloom. Static scenery is split into spatial instance batches so camera and shadow frusta can discard distant blocks. After these changes, a 60-frame completed-render sample at the beachfront/highway entry measured **6.4 ms median, 7.0 ms mean, 9.8 ms p95**. The new inland boulevard sample measured **7.3 ms median, 7.1 ms mean, 13.5 ms p95**. These synchronous render samples include GPU completion but omit normal per-frame animation work.

The automated browser intermittently delivered animation callbacks at approximately 1.9 Hz, while other intervals ran around 30 FPS. A stable, sustained **30 FPS gameplay result at 1080p remains unverified**. Do not interpret the render-only timings as gameplay FPS. The captured browser diagnostic JSON is supplied with the downloadable verification artifacts. Earlier performance and tuning sections below describe previous builds.

## Rear signature — 15 November 2026

Added gold NAREN calligraphy to the rear hatch with a locally bundled, OFL-licensed Explora font. The font loads before the car's canvas texture is created. Chrome inspection of the production build confirmed the lettering is legible from the close chase camera, with the Porsche badge above and Cayenne badge to the right. Driving physics are unchanged.

## High-speed arcade handling — 15 November 2026

The previous model reduced both steering lock and turn-in response as speed increased. At an entry speed of 32 m/s, a half-second full-left coasting input produced only 5.23° of heading change and an average transient turn radius of 172 m. Its steering wheel angle reached only 1.46° in that time.

The revised tuning smoothly blends in additional steering authority between 10 and 26 m/s. Normal lateral capacity rises from 10 to 22 m/s² for arcade cornering. Turn-in response, return-to-centre response and lateral stabilization increase together above city speeds. Low-speed tuning, front-wheel-angle integration, reverse and progressive handbrake recovery remain covered by regression tests.

| Entry speed | Previous heading change | New heading change |
| --- | --- | --- |
| 21.9 km/h | 26.83° | 26.83° |
| 36.1 km/h | 21.96° | 21.96° |
| 72.0 km/h | 9.89° | 19.90° |
| 108.0 km/h | 5.58° | 15.98° |
| 115.2 km/h | 5.23° | 14.98° |

Each comparison starts with the same straight-line acceleration sequence, followed by a 0.5-second full-left coasting input at 60 Hz, using the actual Driving class. At 115.2 km/h, the average transient turn radius fell from 172 m to 60 m. These measurements describe this game's input response.

All 21 driving/camera checks, model geometry checks, both continuous loops and all 2,262 route probes passed. New checks bound a 0.1-second high-speed tap, verify useful authority for a 0.5-second hold, test countersteering/recentring, and preserve the measured low-speed baseline. Build and strict TypeScript checks passed.

Browser inspection worked for this update. The production build rendered the Cayenne, actual browser route checks passed, and A/D keyboard inputs changed heading while travelling above 80 km/h. Reset and Escape pause worked. Console error capture was empty. The automated browser alternated between roughly 24 FPS and one animation callback per second, so continuous real-time handling remains only partially verified. The comparison table uses deterministic fixed-step simulation, independent of browser scheduling. A test-only highway entry uses the normal Driving.step acceleration to initialize velocity, then positions the car on the boulevard for input checks.

### Mechanics reviewed

Criterion's Vehicle Feel Masterclass describes separate input, simulation and assist layers, smoothly fading assists, and automated physics testing. This informed the decision to blend highway assistance continuously and verify input response at multiple speeds. [Matthew Harris, Criterion Games, GDC 2018, slides 38–48](https://media.gdcvault.com/gdc2018/presentations/Harris_Matthew_VehicleFeelMasterclass.pdf)

SuperTuxKart's player controller handles digital steering with distinct steering-in and return-to-centre rates. Its kart API also exposes speed-dependent maximum steering. These support treating lock, response time and recentring as separate tuning parameters. The source was reviewed for design concepts. [Player controller](https://github.com/supertuxkart/stk-code/blob/master/src/karts/controller/player_controller.cpp) · [Kart API](https://doxygen.supertuxkart.net/classKart.html)

## Full steering review — 13 November 2026

- Replaced the accumulated steering multipliers with one actual front-wheel angle shared by physics, wheel animation and route checks. Removed the sensitivity multiplier's coupling to grip and maximum cornering force.
- At parking speeds the car has up to 0.68 radians of steering lock, approximately 39°, for a geometric minimum turning radius of about 3.6 m. The available angle tapers continuously with speed and tire force. Normal cornering assistance is bounded around 10 m/s². Steering rate is limited, with faster recentring and countersteering than initial turn-in.
- Normal steering response transitions from 10/s at rest to 4/s by 28 m/s. Steering slew transitions from 2.8 to 0.65 radians/s. These independent controls replace the previous global sensitivity multiplier.
- All 19 driving/camera checks passed. Coverage includes stationary steering, launch with steering held, left/right symmetry, entry-speed sweep from 1 to 32 m/s, high-speed lane-change settling, braking through a bend, reverse, handbrake recovery, collision contacts, reset and 30/120 Hz consistency. Model geometry checks, both continuous road loops and all 2,262 route probes also passed.
- Build and strict TypeScript checks passed. Browser gameplay inspection remains unavailable, so subjective driving feel still needs an in-browser check.

## Half-strength steering — 13 November 2026

- Reduced the steering gain from 5 to 2.5, halving the current left/right turn-rate gain. Steering response, grip assistance, front-wheel animation and route-test input compensation use the shared gain.
- Build, all 15 driving/camera checks, model checks, both road loops and all 2,262 road probes passed. The turn-rate regression check verifies 2.5× gain in both directions. Fresh browser playtesting remains unavailable.

## Five-times steering — 13 November 2026

- Applied 5× steering curvature gain and quicker key response. Increased the normal cornering and grip assistance to support the tighter arcade turns. Handbrake turning retains its lower-grip response and grip returns progressively after release. Visible front-wheel angles and route-test steering account for the new gain.
- All 15 driving/camera checks pass, including an explicit check that both left and right inputs produce 5× the baseline bicycle-model turn rate. Both road loops and all 2,262 route probes passed. Production build passed. Fresh browser gameplay inspection remains unavailable.

## Easier steering — 13 November 2026

- Increased steering lock and turn rate at city speeds. Steering responds faster to key presses and recentres faster after release. Assistance tapers with speed, while the existing traction and cornering-force limits continue to stabilize faster turns.
- All 14 driving/camera checks, model checks, both continuous loops and all 2,262 road probes passed. Added a regression check for prompt low-speed steering, a useful city turn angle and return to centre.
- Production build and TypeScript checks passed. Driving feel was verified numerically. Fresh browser gameplay inspection remains unavailable due to the previously recorded browser-tool initialization failure.

## Cayenne update — 13 November 2026

- Replaced the roadster with an original procedural Porsche Cayenne approximation. The SUV has an enclosed roof and panoramic panel, four doors, sculpted hood, wheel arches, four-point headlights, rear light bar, hatch badges, larger wheels, brake calipers and interior seating.
- Measured model bounds are approximately 4.95 m long, 2.20 m wide including mirrors, and 1.71 m tall. Shared vehicle dimensions now control the collision footprint and wheelbase. The chase camera focuses higher and maintains extra clearance above the SUV when retracted.
- All 13 driving and camera checks passed. Both continuous city loops and all 2,262 route probes passed with the larger footprint. Model checks passed for dimensions, collision envelope, finite vertex positions and wheel/body animation transforms.
- Inspected front and rear quarter geometry previews using an offline software render. Browser inspection remains unavailable because its runtime cannot initialize its assets. The software previews omit textured badges and browser lighting, so in-browser appearance remains unverified for this update.

## Traction update — 13 November 2026

- Normal driving now has stronger lateral grip, a speed-sensitive cornering-force limit, and smooth power reduction as cornering or sideslip uses the tires' grip. Velocity projection prevents steering from creating extra forward energy. Handbrake slides retain reduced grip, which recovers progressively after release.
- All 13 deterministic driving and camera checks passed. Added regression checks measure actual travel velocity during cornering and slalom, progressive handbrake recovery, and decreasing kinetic speed during a coasting turn.
- In the high-speed full-throttle corner test after eight seconds of acceleration, peak lateral velocity fell from approximately 1.36 m/s to 0.483 m/s. Peak sideslip fell from approximately 2.46° to 0.908°. The medium-speed test measured 1.624° sideslip. Both tests confirmed reduced throttle during the loaded corner.
- All 2,262 actual-world road probes passed. The continuous coastal lap passed 452 waypoints and the inner lap passed 296 waypoints. These route checks ran in Node using the actual world and collision modules, with canvas texture drawing stubbed.
- Production TypeScript compilation and build passed. A fresh browser inspection could not run because the browser tool failed to initialize its assets, including after a reset. The earlier browser and render observations below describe the initial build.

Verified on 12 November 2026 using Windows, Chrome 157, Intel Iris Xe through ANGLE Direct3D11, Node.js 26.8.2, and a 1920 × 1080 browser viewport.

## Checks completed

- Production build and strict TypeScript compilation passed. The build bundles all fonts and game code locally. Vite emits a bundle-size advisory for the approximately 600 KB main JavaScript bundle, about 162 KB gzip.
- Nine deterministic driving and camera checks passed. These cover acceleration, coasting, braking into reverse, forward/reverse steering, handbrake slip, consistent simulation at 30/120 Hz input intervals, a high-speed collision with a 6 cm wall, sliding along a rotated façade, world bounds, safe-road reset, camera retraction, and clearance over a crest.
- In the browser, 2,262 probes passed across all five actual road paths, including each connector and travel lane. Three obstructing palms found during development were repositioned.
- Continuous simulated drives used the same boolean controls as the keyboard. The coastal loop covered 1,566.705 m through 452 waypoints and finished 0.881 m from its starting pose. The inner loop covered 874.217 m through 296 waypoints and finished 0.861 m from its start.
- Captured and inspected the beachfront, casino approach, and headland at golden hour, twilight, and night. Refined palm silhouettes, asphalt, opening composition, night illumination, the sunburst sign, and slope-following road markings.
- Browser interactions verified Drive, W acceleration, Escape pause/resume, R reset, mouse orbit and zoom, lighting buttons, Low/Medium quality changes, and the master-volume slider. Web Audio reached the running state after Drive. Muting produced master gain 0 after resume.
- Production browser checks recorded no console errors. The Intel shader compiler emitted numerical precision warnings during initial shader compilation. The scene continued to render correctly.
- The included static server passed syntax checking and served the built page with HTTP 200 and correct HTML content type.

## Performance measurements

Low quality renders at the full 1920 × 1080 resolution on this device, uses 1024-pixel shadows, and disables bloom. Each sample warms five renders, measures 60 more, and calls `gl.finish()` after every render to include completed GPU work.

| View | Median completed render | 95th percentile |
| --- | --- | --- |
| Beachfront, golden hour | 4.1 ms | 22.1 ms |
| Casino district, night with local lighting | 3.9 ms | 9.5 ms |
| Headland, golden hour | 6.0 ms | 11.4 ms |

The automated browser throttled requestAnimationFrame to roughly one callback per second between interactions despite reporting a visible document. Sustained foreground gameplay FPS remains unverified. The completed-render timings fit within a 33.3 ms frame budget. Audio output was verified through its running graph and volume response, while perceptual listening remains unverified.

## Reproduce

```sh
npm ci
npm run build
node checks/driving-checks.ts
node scripts/serve.mjs --no-open
```

The TypeScript check script requires Node.js 22.18 or newer. Open the printed local URL and append `?qa=1&routes=1&view=headland&quality=low&benchmark=1`. The hidden `qa-report` JSON element contains the actual route and timing results. Diagnostic views continue while browser focus changes, and normal play pauses on lost focus. Use the normal URL for manual driving and listening.

