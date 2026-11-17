# Original Sunspoke Cayenne detail asset

These GLBs are exported from the original procedural approximation in `src/car.ts`; no third-party vehicle mesh was downloaded. The midnight-teal paint, gold NAREN signature, dimensions and wheel pivots belong to this project's existing car design.

The runtime retains the synchronous procedural model as a complete fallback. Its optional `loadAssets()` swaps only geometry at named part IDs, preserving the original materials, signature, steering, wheel spin, brake lights and headlights. Low uses the decimated mesh and Medium/High use the refined mesh.

Editable geometry and Blender source, label source and rebuild helpers are in `source/assets/car/`. The Explora signature font's existing SIL Open Font License remains in `public/fonts/`. Badge textures in the exported preview are conveniences; the game continues to render the locally bundled font on the car.

To rebuild the art assets, run `node source/assets/car/export-source.mjs`, then `python source/assets/car/build-labels.py`, then `blender -b --python source/assets/car/build-car.py`. The art pipeline needs Blender 5.3 and Pillow; playing or rebuilding the browser game uses the normal Node.js commands and does not need Blender.
