import * as THREE from 'three';
import { clamp } from './util.js';

/* ------------------------------------------------------------------
   The night-street look: rain-wet roads that mirror the city, glow
   around every light, and light trails at speed.
   Quality: 0 = low (none of it), 1 = medium (wet roads), 2 = high (wet roads + glow).
   ------------------------------------------------------------------ */
export const GROUND_LAYER = 1;

// Wet roads: render the city upside down into a small texture, then let the road shader blend it in.
export class WetRoads {
  constructor(renderer, scene, camera) {
    Object.assign(this, { renderer, scene, camera });
    this.rt = new THREE.WebGLRenderTarget(256, 256, { type: THREE.UnsignedByteType });
    this.cam = new THREE.PerspectiveCamera();
    this.cam.layers.set(0); // the mirror skips the ground itself
    this.matrix = new THREE.Matrix4();
    this.clip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
    this.uniforms = { reflTex: { value: this.rt.texture }, reflMatrix: { value: this.matrix }, wet: { value: 0 } };
    this.enabled = false;
  }
  setSize(w, h) { this.rt.setSize(Math.max(64, Math.round(w * 0.35)), Math.max(64, Math.round(h * 0.35))); }
  // add the reflection to a road material
  patch(mat) {
    const u = this.uniforms;
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = 'uniform mat4 reflMatrix;\nvarying vec4 vRefl;\nvarying vec2 vWxz;\n' + sh.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\n vec4 wpR = modelMatrix * vec4(transformed, 1.0); vRefl = reflMatrix * wpR; vWxz = wpR.xz;');
      sh.fragmentShader = 'uniform sampler2D reflTex;\nuniform float wet;\nvarying vec4 vRefl;\nvarying vec2 vWxz;\n' +
        'float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
        'float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hsh(i), hsh(i+vec2(1,0)), f.x), mix(hsh(i+vec2(0,1)), hsh(i+vec2(1,1)), f.x), f.y); }\n' +
        sh.fragmentShader.replace('#include <output_fragment>', `#include <output_fragment>
  if (wet > 0.0) {
    vec2 ruv = vRefl.xy / vRefl.w;
    // smear the mirror image up and down the screen, like light on a wet street
    vec3 rc = texture2D(reflTex, ruv).rgb * 0.3;
    rc += texture2D(reflTex, ruv + vec2(0.0, 0.012)).rgb * 0.2 + texture2D(reflTex, ruv - vec2(0.0, 0.012)).rgb * 0.2;
    rc += texture2D(reflTex, ruv + vec2(0.0, 0.03)).rgb * 0.15 + texture2D(reflTex, ruv - vec2(0.0, 0.03)).rgb * 0.15;
    float puddle = 0.45 + 0.55 * smoothstep(0.35, 0.75, vnoise(vWxz * 0.06) * 0.7 + vnoise(vWxz * 0.31) * 0.3);
    gl_FragColor.rgb = gl_FragColor.rgb * (1.0 - 0.25 * puddle * wet) + rc * wet * puddle;
  }`);
    };
    mat.customProgramCacheKey = () => 'wet';
    mat.needsUpdate = true;
  }
  update() {
    const u = this.uniforms;
    u.wet.value = this.enabled ? 0.85 : 0;
    if (!this.enabled) return;
    const c = this.camera, m = this.cam;
    m.fov = c.fov; m.aspect = c.aspect; m.near = c.near; m.far = c.far; m.updateProjectionMatrix();
    // mirror the camera through the ground plane
    const dir = new THREE.Vector3(); c.getWorldDirection(dir);
    m.position.set(c.position.x, -c.position.y, c.position.z);
    m.up.set(0, -1, 0);
    m.lookAt(m.position.x + dir.x, m.position.y - dir.y, m.position.z + dir.z);
    m.updateMatrixWorld();
    this.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.matrix.multiply(m.projectionMatrix).multiply(m.matrixWorldInverse);
    const r = this.renderer, oldClip = r.clippingPlanes, oldRT = r.getRenderTarget();
    r.clippingPlanes = this.clip; r.setRenderTarget(this.rt); r.clear(); r.render(this.scene, m);
    r.setRenderTarget(oldRT); r.clippingPlanes = oldClip;
  }
}

// Glow: loaded only when the quality setting asks for it, so low-end phones never download it.
export async function makeBloom(renderer, scene, camera) {
  const base = 'three/addons/postprocessing/';
  const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }] = await Promise.all([
    import(base + 'EffectComposer.js'), import(base + 'RenderPass.js'), import(base + 'UnrealBloomPass.js')]);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.45, 0.86);
  composer.addPass(bloom);
  composer.setSize2 = (w, h) => { composer.setSize(w, h); bloom.resolution.set(w / 2, h / 2); };
  return composer;
}

// Light trails behind the tail lamps when you are fast or on nitrous.
export class Trails {
  constructor(scene, n = 26) {
    this.n = n; this.pts = [[], []];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(2 * (n - 1) * 6 * 3); this.col = new Float32Array(2 * (n - 1) * 6 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; scene.add(this.mesh); this.v = new THREE.Vector3();
  }
  update(model, car, on) {
    const fade = clamp((car.kmh - 110) / 70, 0, 1) * 0.8 + (car.nos ? 0.35 : 0), live = on && fade > 0.02;
    this.mesh.visible = live;
    if (!live) { this.pts[0].length = this.pts[1].length = 0; return; }
    model.g.updateMatrixWorld();
    model.tails.forEach((t, i) => { this.v.copy(t).applyMatrix4(model.g.matrixWorld); const a = this.pts[i]; a.unshift([this.v.x, this.v.y, this.v.z]); if (a.length > this.n) a.pop(); });
    let k = 0;
    const w = 0.09;
    for (const a of this.pts) for (let i = 0; i < this.n - 1; i++) {
      const p = a[i], q = a[i + 1];
      if (!p || !q) { for (let j = 0; j < 18; j++) { this.pos[k * 18 + j] = 0; this.col[k * 18 + j] = 0; } k++; continue; }
      const c1 = fade * (1 - i / this.n), c2 = fade * (1 - (i + 1) / this.n);
      const quad = [[p[0], p[1] - w, p[2], c1], [p[0], p[1] + w, p[2], c1], [q[0], q[1] + w, q[2], c2], [p[0], p[1] - w, p[2], c1], [q[0], q[1] + w, q[2], c2], [q[0], q[1] - w, q[2], c2]];
      quad.forEach(([x, y, z, c], j) => { const o = k * 18 + j * 3; this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z; this.col[o] = c; this.col[o + 1] = c * 0.08; this.col[o + 2] = c * 0.1; });
      k++;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.color.needsUpdate = true;
  }
}
