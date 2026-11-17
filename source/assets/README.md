# Imported asset sources

This directory records the provenance and reproducible preparation of the locally bundled library in `public/assets`.

All selected imported assets are CC0 1.0. They may be redistributed in the public GitHub repository and source ZIP. Original authorship remains with the credited creators; Sunspoke does not claim to have authored these assets. The separately authored Cayenne source is in `car/`.

- Poly Haven: https://polyhaven.com/license explicitly allows any use and redistribution. Individual API source and author records are retained in `provenance`.
- Kenney: original creator pages identify Creative Commons CC0. The selected GLB mirror also carries its CC0 notice, retained in `provenance/kenney-mirror-license.txt`.
- Quaternius: the selected 2021-2023 uploads on the creator's Poly Pizza account explicitly say Public Domain (CC0). The exact source-page records are retained in `provenance`.

`acquire-assets.py --surfaces` downloads the 1K PBR sets and Radiance HDRIs; `--models` downloads the model sources. Then `Blender --background --python source/assets/convert-assets.py` exports static, normalized GLBs. Blender was run using `C:/Program Files/Blender Foundation/Blender 5.3/blender.exe`.

Intermediate model source files live in a temporary `cache` directory while acquiring. These large transient originals are excluded from Git and release ZIPs; the compact GLBs, attribution, API metadata, and acquisition/conversion scripts remain. Material base colors use sRGB; normals and roughness use linear color. Normal maps are OpenGL (+Y). Roughness maps are grayscale JPEG and are not packed ARM textures.

GLBs use metres, +Y up, X/Z centered, and Y=0 at their lowest vertex. `manifest.json` stores measured post-conversion bounds and dimensions in X/Y/Z order. Forward +Z is the common placement orientation; symmetric foliage/rocks have no meaningful front. Asymmetric structures and seating retain their source-facing geometry.

The optional asset-preparation scripts need Python with Pillow (`python -m pip install Pillow`) and Blender available on your system. These tools are not needed to play or rebuild the game with npm.

Generate the three model detail levels with `blender --background --python source/assets/generate-lods.py`, then run `python source/assets/compact-lods.py`. Source GLBs are the bundled high-detail files; regeneration needs no external downloads.

For the original car, `blender --background --python source/assets/car/build-car.py` rebuilds both GLBs from `car/cayenne-source.json.gz` and saves the editable Blender file. Label PNGs are already included; `python source/assets/car/build-labels.py` can regenerate them using local fonts. `source/assets/car/export-source.mjs` refreshes the geometry source from `src/car.ts` after a code-model edit.
