# Sunspoke Coast verification

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

