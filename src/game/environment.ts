import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  Vector3
} from 'three';

const DAY_SKY = new Color('#78b9e8');
const DUSK_SKY = new Color('#d77f68');
const NIGHT_SKY = new Color('#071226');
const DAY_FOG = new Color('#9bc9e5');
const NIGHT_FOG = new Color('#09101d');
const UP = new Vector3(0, 1, 0);

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export class WorldEnvironment extends Group {
  readonly sunLight = new DirectionalLight('#fff1d2', 2.2);
  readonly moonLight = new DirectionalLight('#9db8ff', 0.12);
  readonly hemisphere = new HemisphereLight('#b9dcff', '#536742', 1.25);

  private readonly skyColor = new Color();
  private readonly fogColor = new Color();
  private readonly sun: Mesh;
  private readonly moon: Mesh;
  private readonly starField: Points;
  private readonly cloudLayer = new Group();

  constructor(private readonly scene: Scene) {
    super();

    this.sunLight.position.set(40, 70, 25);
    this.sunLight.target.position.set(0, 0, 0);
    this.moonLight.position.set(-40, -70, -25);
    this.add(this.sunLight, this.sunLight.target, this.moonLight, this.moonLight.target, this.hemisphere);

    const sunMaterial = new MeshBasicMaterial({ color: '#fff4b0', fog: false });
    const moonMaterial = new MeshBasicMaterial({ color: '#d8e3f4', fog: false });
    this.sun = new Mesh(new BoxGeometry(5, 5, 0.7), sunMaterial);
    this.moon = new Mesh(new BoxGeometry(4.2, 4.2, 0.7), moonMaterial);
    this.add(this.sun, this.moon);

    this.starField = this.createStars();
    this.add(this.starField);
    this.createClouds();
    this.add(this.cloudLayer);

    this.scene.background = this.skyColor.copy(DAY_SKY);
    this.scene.fog = new Fog(DAY_FOG, 24, 92);
  }

  update(timeOfDay: number, dt: number, focus: Vector3): void {
    const normalized = ((timeOfDay % 1) + 1) % 1;
    const angle = normalized * Math.PI * 2 - Math.PI / 2;
    const height = Math.sin(angle);
    const daylight = clamp01(height * 1.7 + 0.2);
    const horizon = clamp01(1 - Math.abs(height) * 5);

    this.skyColor.copy(NIGHT_SKY).lerp(DAY_SKY, daylight);
    if (daylight > 0.08) this.skyColor.lerp(DUSK_SKY, horizon * 0.38);
    this.fogColor.copy(NIGHT_FOG).lerp(DAY_FOG, daylight);
    if (daylight > 0.08) this.fogColor.lerp(DUSK_SKY, horizon * 0.16);

    this.scene.background = this.skyColor;
    if (this.scene.fog) this.scene.fog.color.copy(this.fogColor);

    const orbitRadius = 72;
    const orbit = new Vector3(Math.cos(angle), Math.sin(angle), 0.32).normalize().multiplyScalar(orbitRadius);
    this.sun.position.copy(focus).add(orbit);
    this.moon.position.copy(focus).sub(orbit);
    this.sun.lookAt(focus);
    this.moon.lookAt(focus);

    this.sunLight.position.copy(focus).add(orbit);
    this.sunLight.target.position.copy(focus);
    this.moonLight.position.copy(focus).sub(orbit);
    this.moonLight.target.position.copy(focus);
    this.sunLight.intensity = 0.08 + daylight * 2.15;
    this.moonLight.intensity = 0.04 + (1 - daylight) * 0.22;
    this.hemisphere.intensity = 0.16 + daylight * 1.05;
    this.hemisphere.color.set('#b9dcff').lerp(new Color('#34476e'), 1 - daylight);
    this.hemisphere.groundColor.set('#536742').lerp(new Color('#111827'), 1 - daylight);

    (this.starField.material as PointsMaterial).opacity = clamp01((0.42 - daylight) * 2.4);
    this.starField.position.set(focus.x, focus.y, focus.z);
    this.starField.rotation.y += dt * 0.004;

    this.cloudLayer.position.set(focus.x, 0, focus.z);
    for (const cloud of this.cloudLayer.children) {
      cloud.position.x += dt * 0.8;
      if (cloud.position.x > 110) cloud.position.x = -110;
    }
    const cloudMaterial = (this.cloudLayer.children[0]?.children[0] as Mesh | undefined)?.material as MeshBasicMaterial | undefined;
    if (cloudMaterial) {
      cloudMaterial.color.set('#ffffff').lerp(new Color('#7c879b'), 1 - daylight);
      cloudMaterial.opacity = 0.38 + daylight * 0.34;
    }
  }

  setFogDistance(distance: number): void {
    if (!(this.scene.fog instanceof Fog)) return;
    this.scene.fog.near = Math.max(12, distance * 0.28);
    this.scene.fog.far = Math.max(42, distance);
  }

  setQuality(quality: 'fast' | 'balanced' | 'fancy'): void {
    this.cloudLayer.visible = quality !== 'fast';
    const visibleClouds = quality === 'fancy' ? this.cloudLayer.children.length : 16;
    this.cloudLayer.children.forEach((cloud, index) => {
      cloud.visible = index < visibleClouds;
    });
    (this.starField.material as PointsMaterial).size = quality === 'fancy' ? 0.52 : 0.42;
  }

  dispose(): void {
    this.traverse((object) => {
      if (!(object instanceof Mesh) && !(object instanceof Points)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
  }

  private createStars(): Points {
    const random = seededRandom(981723);
    const positions: number[] = [];
    for (let i = 0; i < 520; i += 1) {
      const theta = random() * Math.PI * 2;
      const y = 22 + random() * 68;
      const radius = 84 + random() * 16;
      const horizontalRadius = Math.sqrt(Math.max(0, radius * radius - y * y * 0.45));
      positions.push(Math.cos(theta) * horizontalRadius, y, Math.sin(theta) * horizontalRadius);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const material = new PointsMaterial({
      color: '#edf5ff',
      size: 0.52,
      transparent: true,
      opacity: 0,
      sizeAttenuation: true,
      depthWrite: false,
      fog: false
    });
    return new Points(geometry, material);
  }

  private createClouds(): void {
    const random = seededRandom(43771);
    const geometry = new BoxGeometry(6, 1.2, 4);
    const material = new MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      fog: true
    });

    for (let i = 0; i < 26; i += 1) {
      const cloud = new Group();
      const pieces = 2 + Math.floor(random() * 4);
      for (let p = 0; p < pieces; p += 1) {
        const piece = new Mesh(geometry, material);
        piece.position.set(p * 4.3 + random() * 2, random() * 0.35, (random() - 0.5) * 4.5);
        piece.scale.set(0.75 + random() * 1.1, 0.65 + random() * 0.45, 0.8 + random() * 0.8);
        cloud.add(piece);
      }
      cloud.position.set((random() - 0.5) * 180, 38 + random() * 10, (random() - 0.5) * 180);
      this.cloudLayer.add(cloud);
    }
  }
}

export function getDaylight(timeOfDay: number): number {
  const angle = (((timeOfDay % 1) + 1) % 1) * Math.PI * 2 - Math.PI / 2;
  return clamp01(Math.sin(angle) * 1.7 + 0.2);
}

export { UP };
