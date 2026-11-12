# Sunspoke Coast verification

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
| Beachfront, golden hour | 5.3 ms | 9.6 ms |
| Casino district, night with local lighting | 5.1 ms | 13.1 ms |
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
