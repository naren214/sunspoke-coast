# Sunspoke Coast visual upgrade status

Review build: 17 November 2026. The visual systems below are implemented in source and included in the production build. Browser acceptance and publication remain pending. The current live Site and GitHub main still contain the preceding release.

| Area | Implemented | Evidence and remaining review |
| --- | --- | --- |
| Vehicle | Sculpted Cayenne body, cabin, wheel detail, retained NAREN signature, local GLBs, Low/higher detail selection | Real GLB decoding, dimensions, material identity, pivots and animation checks pass. In-game appearance still needs review. |
| Ground and planting | Textured ground, 135,970 wind-animated grass tufts in culled chunks, imported palms/firs/broadleaf trees | All grass placements clear roads, water, gallery and stunt areas. Visual density and transitions need browser review. |
| Roads | 53 roads with continuous profiles, curbs, gutters, shoulders, arrows, crossings, reflectors and airfield markings | 22,467 lane probes, 867 surface probes and ten simulated circuits pass. |
| Districts | 12 additional homes, 6 towers, 200 street-prop placements, 98 foundations, street/district signs and distant ridges | World connectivity and collider-clearance checks pass. Skyline composition and floating/intersecting props need screenshot review. |
| Lake and river | Local water elevations, bank treatments, 188 reed clumps, retained skyline bridge and boat placements | Bridge traversals pass. Water appearance and reflections need browser review. |
| Gallery | Fitted eight image displays, separated captions, transparent sliding doors and status lights | Image bounds, door collision/sensors, occupancy holds and bidirectional traversal pass. Glass, exposure and caption readability need browser review. |
| Lighting | Three HDR environments, coordinated presets, contact shadows and smoothly handed-off nearby lights | Preset propagation and light-fade checks pass. Shader compilation, sign brightness and all three lighting appearances need browser review. |
| Quality | Three model LODs; 4/8/12 nearby lights; texture, grass, resolution and effect limits; High-only lake reflection and ambient shading | All 87 scenery GLBs decode with consistent named parts. Footprints remain stable when geometry changes. Actual GPU cost is unmeasured. |
| Ambient life | Existing adult beach crowd plus locally bundled adult figures, birds, boats and flags | Source/geometry checks pass. Motion and placement need browser review. |
| Camera and UI | Retained interpolated chase camera, indoor profile, district label, staged loading, map export, F2 photo mode and performance export | Camera stability passes at 60–165 Hz. Browser interactions, screenshots and exports still need click-through verification. |
| Loading and delivery | Prebaked static world, local models/maps/HDRs, background detail loads, credits and full source/build ZIP | TypeScript, production build, asset decoding and static download-budget checks pass. No external asset service is needed to play. |

## Acceptance gate still open

- Capture beachfront, casino approach, headland, downtown, canals, port, airport, island, Sierra Verde, Silver Lake, bridge and gallery at golden hour, twilight and night. Inspect road visibility, horizon, lighting, signs, car/cabin detail, prop placement and LOD transitions.
- Drive the principal loops and all connectors in the browser. Exercise braking/reverse, handbrake, glancing contact, reset, ramp jump, façade orbit and gallery entry/exit. Pause/resume with a driving key held; verify map/photo export, volume and audio response.
- On the available Intel Iris Xe laptop, complete three five-minute foreground Low-quality drives at a 1920 × 1080 browser viewport. Record browser/GPU, the 1440 × 810 internal render size, median and p95 frame times, average FPS, console errors and missing requests. The target is 30 FPS; no current-build measurement establishes that target yet.
- Fix any observed failures, rerun affected checks, then publish the exact verified commit to GitHub main and the existing Site. Refresh the ZIP if code changes during acceptance.

Browser control failed with Windows cursor-access denial. The native retry was then stopped because the browser URL could not be determined reliably enough to enforce browser access policy. That prevents current-build browser inspection; headless geometry tests and earlier screenshots cannot replace it.

## Reproduce the local review

Double-click `Launch Sunspoke Coast.bat`, or run `node scripts/serve.mjs`. Use Low quality first. The pause menu can save a performance JSON report, and the map/photo tools can save their images. `README.md` lists build and automated-check commands. `TESTING.md` separates this build's results from earlier browser evidence.
