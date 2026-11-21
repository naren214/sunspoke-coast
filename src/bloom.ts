import { Vector2 } from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export function createBloom(width: number, height: number) {
  const bloom = new UnrealBloomPass(new Vector2(width, height), .22, .35, 1.15);

  // Fullscreen bloom passes do not use depth. Keep the scene target's depth.
  for (const target of [bloom.renderTargetBright, ...bloom.renderTargetsHorizontal, ...bloom.renderTargetsVertical]) {
    target.depthBuffer = false;
  }

  bloom.separableBlurMaterials.forEach((material, mip) => {
    const weights: number[] = material.uniforms.gaussianCoefficients.value;
    const pairs: Vector2[] = [];
    for (let i = 1; i + 1 < weights.length; i += 2) {
      const weight = weights[i] + weights[i + 1];
      pairs.push(new Vector2(i + weights[i + 1] / weight, weight));
    }
    material.uniforms.pairedTaps = { value: pairs };
    material.defines.PAIR_COUNT = pairs.length;
    material.defines.LAST_TAP = weights.length % 2 === 0 ? weights.length - 1 : 0;
    material.defines.DOWNSAMPLES_HORIZONTALLY = mip > 0 ? 1 : 0;

    // When input and output sizes match, a linear sample combines two
    // adjacent texels with the original Gaussian weights. Later horizontal
    // passes downsample, so their taps are not on adjacent input texels.
    material.fragmentShader = `
      varying vec2 vUv;
      uniform sampler2D colorTexture;
      uniform vec2 invSize;
      uniform vec2 direction;
      uniform float gaussianCoefficients[KERNEL_RADIUS];
      uniform vec2 pairedTaps[PAIR_COUNT];

      vec3 symmetricSample(vec2 offset) {
        return texture2D(colorTexture, vUv + offset).rgb
          + texture2D(colorTexture, vUv - offset).rgb;
      }

      void main() {
        vec2 stepUV = direction * invSize;
        vec3 sum = texture2D(colorTexture, vUv).rgb * gaussianCoefficients[0];
        #if DOWNSAMPLES_HORIZONTALLY
          if (direction.x != 0.0) {
            for (int i = 1; i < KERNEL_RADIUS; i++) {
              sum += symmetricSample(stepUV * float(i)) * gaussianCoefficients[i];
            }
            gl_FragColor = vec4(sum, 1.0);
            return;
          }
        #endif
        for (int i = 0; i < PAIR_COUNT; i++) {
          sum += symmetricSample(stepUV * pairedTaps[i].x) * pairedTaps[i].y;
        }
        #if LAST_TAP
          sum += symmetricSample(stepUV * float(LAST_TAP)) * gaussianCoefficients[LAST_TAP];
        #endif
        gl_FragColor = vec4(sum, 1.0);
      }
    `;
  });
  return bloom;
}
