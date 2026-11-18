# Sunspoke GT model

The Sunspoke GT is an original two-seat coupe with a metallic teal body and gold NAREN signature. Low and High GLBs contain the same named parts, with four independently animated wheels, front steering pivots, and separate brake calipers. The game applies its own live paint, lights, glass, and signature to both files. It shares geometry between the teal and coral cars and builds the same coupe procedurally if local GLB loading fails.

The editable model is authored in `src/gt-model.ts`. Rebuild the assets with:

```powershell
node source/assets/car/export-source.mjs
python source/assets/car/build-labels.py
blender -b --python source/assets/car/build-car.py
```

The rebuild saves the editable Blender scene and exports both detail levels. The art tools use Blender 5.3 and Pillow. The regular browser build uses the bundled GLBs.
