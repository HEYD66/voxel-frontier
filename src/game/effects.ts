import {
  BoxGeometry,
  Camera,
  Color,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Vector3
} from 'three';
import { getBlockDefinition } from './blocks';
import {
  ARMOR_DEFINITIONS,
  TOOL_DEFINITIONS,
  isArmorItemId,
  isFoodItemId,
  isToolItemId,
  type ArmorItemId,
  type ItemId,
  type ToolDefinition
} from './survival';
import { BlockId, isBlockId } from './types';

interface Particle {
  mesh: Mesh;
  velocity: Vector3;
  life: number;
  maxLife: number;
}

export class BlockTargetIndicator extends Group {
  private readonly outline: LineSegments;
  private readonly material: LineBasicMaterial;

  constructor() {
    super();
    this.material = new LineBasicMaterial({
      color: '#111111',
      transparent: true,
      opacity: 0.72,
      depthTest: true
    });
    this.outline = new LineSegments(new EdgesGeometry(new BoxGeometry(1.008, 1.008, 1.008)), this.material);
    this.outline.renderOrder = 5;
    this.add(this.outline);
    this.visible = false;
  }

  setTarget(x: number, y: number, z: number): void {
    this.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
  }

  setBreakProgress(progress: number): void {
    const value = Math.max(0, Math.min(1, progress));
    this.material.color.set(value > 0 ? '#f4f1dc' : '#111111');
    this.material.opacity = 0.58 + value * 0.36;
    const pulse = 1 + Math.sin(value * Math.PI * 10) * 0.002;
    this.outline.scale.setScalar(pulse);
  }

  dispose(): void {
    this.outline.geometry.dispose();
    this.material.dispose();
  }
}

export class BlockParticles extends Group {
  private readonly particles: Particle[] = [];
  private readonly cubeGeometry = new BoxGeometry(0.11, 0.11, 0.11);

  spawn(position: Vector3, color: string): void {
    const center = position.clone().addScalar(0.5);
    for (let i = 0; i < 14; i += 1) {
      const material = new MeshBasicMaterial({ color: new Color(color) });
      const mesh = new Mesh(this.cubeGeometry, material);
      mesh.position.copy(center).add(new Vector3((Math.random() - 0.5) * 0.66, (Math.random() - 0.5) * 0.66, (Math.random() - 0.5) * 0.66));
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      this.add(mesh);
      this.particles.push({
        mesh,
        velocity: new Vector3((Math.random() - 0.5) * 2.2, 1.1 + Math.random() * 1.7, (Math.random() - 0.5) * 2.2),
        life: 0.55 + Math.random() * 0.25,
        maxLife: 0.8
      });
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const particle = this.particles[i];
      if (!particle) continue;
      particle.life -= dt;
      particle.velocity.y -= 7.5 * dt;
      particle.mesh.position.addScaledVector(particle.velocity, dt);
      particle.mesh.rotation.x += dt * 5;
      particle.mesh.rotation.y += dt * 4;
      const scale = Math.max(0.02, particle.life / particle.maxLife);
      particle.mesh.scale.setScalar(scale);
      if (particle.life > 0) continue;
      this.remove(particle.mesh);
      (particle.mesh.material as MeshBasicMaterial).dispose();
      this.particles.splice(i, 1);
    }
  }

  dispose(): void {
    for (const particle of this.particles) (particle.mesh.material as MeshBasicMaterial).dispose();
    this.particles.length = 0;
    this.cubeGeometry.dispose();
    super.clear();
  }
}

export class HeldBlockView {
  readonly mesh: Mesh<BoxGeometry, MeshBasicMaterial>;
  private readonly blockMaterial: MeshBasicMaterial;
  private readonly blockDetails = new Group();
  private readonly blockDetailGeometries: BoxGeometry[] = [];
  private readonly blockDetailMaterials: MeshBasicMaterial[] = [];
  private readonly itemModel = new Group();
  private readonly itemGeometries = new Set<BoxGeometry>();
  private readonly itemMaterials = new Set<MeshBasicMaterial>();
  private currentItem: ItemId | null = null;
  private currentBlockColor = '#6a9849';
  private showingBlock = true;
  private swing = 0;
  private movingTime = 0;
  private useProgress = 0;

  constructor(private readonly camera: Camera) {
    const geometry = new BoxGeometry(0.26, 0.26, 0.26);
    this.blockMaterial = createHeldMaterial(this.currentBlockColor);
    this.mesh = new Mesh(geometry, this.blockMaterial);
    this.createBlockDetails();
    this.mesh.add(this.blockDetails, this.itemModel);
    this.mesh.position.set(this.getHorizontalOffset(), -0.42, -0.86);
    this.mesh.scale.setScalar(this.getViewportScale());
    this.mesh.rotation.set(-0.22, 0.62, 0.08);
    this.mesh.renderOrder = 20;
    camera.add(this.mesh);
  }

  setColor(color: string): void {
    this.currentItem = null;
    this.useProgress = 0;
    this.showBlock(color);
  }

  setItem(item: ItemId | null | undefined, blockColor?: string): void {
    if (item === null || item === undefined || item === BlockId.Air) {
      this.clear();
      return;
    }

    if (isBlockId(item)) {
      if (item === BlockId.Torch) {
        if (!this.showingBlock && this.currentItem === item) return;
        this.currentItem = item;
        this.showingBlock = false;
        this.blockMaterial.visible = false;
        this.blockDetails.visible = false;
        this.clearItemModel();
        this.createTorchModel();
        return;
      }
      this.currentItem = item;
      this.showBlock(blockColor ?? getBlockDefinition(item).mapColor);
      return;
    }

    if (!this.showingBlock && this.currentItem === item) return;
    this.currentItem = item;
    this.showingBlock = false;
    this.blockMaterial.visible = false;
    this.blockDetails.visible = false;
    this.clearItemModel();

    if (isToolItemId(item)) {
      this.createToolModel(TOOL_DEFINITIONS[item]);
    } else if (isArmorItemId(item)) {
      this.createArmorModel(item);
    } else if (isFoodItemId(item)) {
      this.createFoodModel(item);
    } else {
      this.createMaterialModel(item);
    }
  }

  clear(): void {
    this.currentItem = null;
    this.showingBlock = false;
    this.useProgress = 0;
    this.blockMaterial.visible = false;
    this.blockDetails.visible = false;
    this.clearItemModel();
  }

  setUseProgress(progress: number): void {
    this.useProgress = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  }

  clearUseProgress(): void {
    this.useProgress = 0;
  }

  triggerSwing(): void {
    this.swing = 1;
    this.useProgress = 0;
  }

  update(dt: number, horizontalSpeed: number, onGround: boolean): void {
    if (horizontalSpeed > 0.2 && onGround) this.movingTime += dt * Math.min(10, 5 + horizontalSpeed);
    const bob = horizontalSpeed > 0.2 && onGround ? Math.sin(this.movingTime) * 0.018 : 0;
    this.swing = Math.max(0, this.swing - dt * 3.8);
    const swingCurve = Math.sin((1 - this.swing) * Math.PI) * this.swing;
    const useCurve = Math.sin(this.useProgress * Math.PI);
    const foodUse = this.currentItem !== null && isFoodItemId(this.currentItem)
      ? this.useProgress
      : 0;
    const horizontalOffset = this.getHorizontalOffset();
    this.mesh.scale.setScalar(this.getViewportScale());
    this.mesh.position.set(
      horizontalOffset - swingCurve * 0.19 - foodUse * 0.22,
      -0.42 + bob - swingCurve * 0.14 + foodUse * 0.19 + useCurve * 0.025,
      -0.86 + swingCurve * 0.16 + foodUse * 0.2
    );
    this.mesh.rotation.set(
      -0.22 + bob * 2.5 + swingCurve * 1.1 + foodUse * 0.65,
      0.62 + swingCurve * 0.5 - foodUse * 0.32,
      0.08 - swingCurve * 0.35 + useCurve * 0.16
    );
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.clearItemModel();
    for (const geometry of this.blockDetailGeometries) geometry.dispose();
    for (const material of this.blockDetailMaterials) material.dispose();
    this.blockDetails.clear();
    this.mesh.geometry.dispose();
    this.blockMaterial.dispose();
    this.mesh.clear();
  }

  private showBlock(color: string): void {
    this.clearItemModel();
    this.currentBlockColor = color;
    this.showingBlock = true;
    this.blockMaterial.visible = true;
    this.blockDetails.visible = true;
    this.updateBlockPalette(color);
  }

  private createBlockDetails(): void {
    const lightMaterial = createHeldMaterial(adjustColor(this.currentBlockColor, 0.12));
    const darkMaterial = createHeldMaterial(adjustColor(this.currentBlockColor, -0.14));
    this.blockDetailMaterials.push(lightMaterial, darkMaterial);

    this.addBlockDetail([0.052, 0.052, 0.008], [-0.071, 0.058, 0.134], lightMaterial);
    this.addBlockDetail([0.038, 0.038, 0.008], [0.062, -0.049, 0.134], darkMaterial);
    this.addBlockDetail([0.029, 0.029, 0.008], [0.012, 0.076, 0.134], darkMaterial);
    this.addBlockDetail([0.057, 0.008, 0.047], [0.054, 0.134, -0.058], lightMaterial);
    this.addBlockDetail([0.036, 0.008, 0.036], [-0.064, 0.134, 0.036], darkMaterial);
  }

  private addBlockDetail(
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    material: MeshBasicMaterial
  ): void {
    const geometry = new BoxGeometry(...size);
    const detail = new Mesh(geometry, material);
    detail.position.set(...position);
    detail.renderOrder = 21;
    this.blockDetailGeometries.push(geometry);
    this.blockDetails.add(detail);
  }

  private updateBlockPalette(color: string): void {
    const base = new Color(color);
    this.blockMaterial.color.copy(base);
    this.blockDetailMaterials[0]?.color.copy(adjustColor(base, 0.12));
    this.blockDetailMaterials[1]?.color.copy(adjustColor(base, -0.14));
  }

  private createToolModel(definition: ToolDefinition): void {
    const model = new Group();
    const palette = getToolPalette(definition.tier);
    model.rotation.set(-0.12, 0.08, -0.54);
    model.position.set(0.01, 0.01, 0);
    this.itemModel.add(model);

    this.addItemBox(model, [0.052, 0.42, 0.052], [0, -0.075, 0], palette.handle);
    this.addItemBox(model, [0.018, 0.3, 0.056], [-0.018, -0.075, 0], palette.handleLight);

    if (definition.kind === 'pickaxe') {
      this.addItemBox(model, [0.34, 0.068, 0.076], [0, 0.15, 0], palette.head);
      this.addItemBox(model, [0.092, 0.052, 0.07], [-0.17, 0.125, 0], palette.headDark, [0, 0, 0.28]);
      this.addItemBox(model, [0.092, 0.052, 0.07], [0.17, 0.125, 0], palette.headLight, [0, 0, -0.28]);
      return;
    }

    if (definition.kind === 'axe') {
      this.addItemBox(model, [0.16, 0.075, 0.08], [0.04, 0.15, 0], palette.head);
      this.addItemBox(model, [0.11, 0.145, 0.075], [0.105, 0.105, 0], palette.headLight);
      this.addItemBox(model, [0.06, 0.09, 0.084], [-0.055, 0.135, 0], palette.headDark);
      return;
    }

    if (definition.kind === 'shovel') {
      this.addItemBox(model, [0.15, 0.16, 0.07], [0, 0.15, 0], palette.head);
      this.addItemBox(model, [0.1, 0.055, 0.074], [0, 0.247, 0], palette.headLight);
      this.addItemBox(model, [0.1, 0.035, 0.078], [0, 0.058, 0], palette.headDark);
      return;
    }

    // Swords use a dedicated blade rather than reusing a shovel head.
    this.addItemBox(model, [0.082, 0.35, 0.052], [0, 0.255, 0], palette.head);
    this.addItemBox(model, [0.034, 0.31, 0.058], [-0.026, 0.255, 0], palette.headLight);
    this.addItemBox(model, [0.052, 0.072, 0.048], [0, 0.46, 0], palette.headLight, [0, 0, Math.PI / 4]);
    this.addItemBox(model, [0.255, 0.045, 0.072], [0, 0.07, 0], palette.guard);
    this.addItemBox(model, [0.09, 0.065, 0.075], [0, -0.31, 0], palette.guard);
  }

  private createTorchModel(): void {
    const model = new Group();
    model.name = 'Held torch';
    model.rotation.set(-0.16, 0.08, -0.34);
    model.position.set(0, 0.015, 0);
    this.itemModel.add(model);

    this.addItemBox(model, [0.055, 0.42, 0.055], [0, -0.075, 0], '#7a4324');
    this.addItemBox(model, [0.018, 0.33, 0.059], [-0.018, -0.08, 0], '#b97136');
    this.addItemBox(model, [0.085, 0.055, 0.085], [0, 0.145, 0], '#4e2b1b');
    this.addItemBox(model, [0.14, 0.15, 0.09], [0, 0.245, 0], '#f05a20', [0, 0, Math.PI / 4]);
    this.addItemBox(model, [0.09, 0.11, 0.098], [0, 0.25, 0], '#ffad2f', [0, 0, -Math.PI / 4]);
    this.addItemBox(model, [0.042, 0.07, 0.104], [0, 0.255, 0], '#fff0a0');
  }

  private createFoodModel(item: ItemId): void {
    const cooked = item === 'cooked_pork' || item === 'cooked_mutton' || item === 'cooked_beef';
    const beef = item === 'raw_beef' || item === 'cooked_beef';
    const spoiled = item === 'rotten_flesh';
    const meat = spoiled ? '#76633c' : beef ? (cooked ? '#744027' : '#a84f4e') : cooked ? '#9b552c' : '#c87d78';
    const meatLight = spoiled ? '#978454' : beef ? (cooked ? '#a66332' : '#d67870') : cooked ? '#c77b3e' : '#e5a29a';
    const fat = spoiled ? '#625b35' : beef ? (cooked ? '#c99052' : '#edc7ae') : cooked ? '#d4a258' : '#f0c3b4';
    const model = new Group();
    model.rotation.set(-0.2, -0.08, -0.24);
    this.itemModel.add(model);
    this.addItemBox(model, [0.27, 0.17, 0.09], [0, 0, 0], meat);
    this.addItemBox(model, [0.16, 0.055, 0.098], [-0.03, 0.09, 0], meatLight);
    this.addItemBox(model, [0.075, 0.06, 0.102], [0.09, -0.07, 0], fat);
    this.addItemBox(model, [0.045, 0.04, 0.104], [-0.1, 0.035, 0], fat);
  }

  private createArmorModel(item: ArmorItemId): void {
    const leather = item.startsWith('leather_');
    const diamond = item.startsWith('diamond_');
    const base = leather ? '#8b572f' : diamond ? '#42cfc6' : '#bdc8ca';
    const light = leather ? '#c08452' : diamond ? '#9af1e6' : '#eef3f2';
    const dark = leather ? '#5b351f' : diamond ? '#218f94' : '#788486';
    const shadow = leather ? '#3b2418' : diamond ? '#176d76' : '#566163';
    const slot = ARMOR_DEFINITIONS[item].slot;
    const model = new Group();
    model.rotation.set(-0.18, 0.08, -0.26);
    model.position.set(0, 0.01, 0);
    this.itemModel.add(model);

    if (slot === 'head') {
      this.addItemBox(model, [0.28, 0.07, 0.12], [0, 0.12, 0], light);
      this.addItemBox(model, [0.065, 0.22, 0.12], [-0.108, 0.015, 0], base);
      this.addItemBox(model, [0.065, 0.22, 0.12], [0.108, 0.015, 0], dark);
      this.addItemBox(model, [0.15, 0.045, 0.126], [0, 0.045, 0], shadow);
      return;
    }

    if (slot === 'chest') {
      this.addItemBox(model, [0.22, 0.25, 0.085], [0, -0.01, 0], base);
      this.addItemBox(model, [0.1, 0.085, 0.1], [-0.145, 0.085, 0], light);
      this.addItemBox(model, [0.1, 0.085, 0.1], [0.145, 0.085, 0], dark);
      this.addItemBox(model, [0.17, 0.055, 0.094], [0, -0.155, 0], shadow);
      this.addItemBox(model, [0.055, 0.18, 0.094], [-0.045, 0.005, 0], light);
      return;
    }

    if (slot === 'legs') {
      this.addItemBox(model, [0.28, 0.07, 0.09], [0, 0.13, 0], light);
      this.addItemBox(model, [0.22, 0.08, 0.085], [0, 0.06, 0], base);
      this.addItemBox(model, [0.085, 0.24, 0.08], [-0.068, -0.09, 0], base);
      this.addItemBox(model, [0.085, 0.24, 0.08], [0.068, -0.09, 0], dark);
      return;
    }

    this.addItemBox(model, [0.09, 0.17, 0.085], [-0.075, 0.035, 0], base);
    this.addItemBox(model, [0.09, 0.17, 0.085], [0.075, 0.035, 0], dark);
    this.addItemBox(model, [0.135, 0.075, 0.14], [-0.075, -0.09, 0.025], light);
    this.addItemBox(model, [0.135, 0.075, 0.14], [0.075, -0.09, 0.025], base);
  }

  private createMaterialModel(item: ItemId): void {
    const model = new Group();
    model.rotation.set(-0.18, 0.1, -0.24);
    this.itemModel.add(model);

    if (item === 'stick') {
      this.addItemBox(model, [0.055, 0.42, 0.055], [0, 0, 0], '#78502b', [0, 0, -0.45]);
      this.addItemBox(model, [0.018, 0.31, 0.059], [-0.055, 0.012, 0], '#a7773e', [0, 0, -0.45]);
      return;
    }

    if (item === 'iron_ingot') {
      this.addItemBox(model, [0.27, 0.09, 0.12], [0, -0.015, 0], '#c9d1d0');
      this.addItemBox(model, [0.18, 0.055, 0.13], [0, 0.055, 0], '#eef2ed');
      this.addItemBox(model, [0.19, 0.025, 0.134], [-0.015, -0.062, 0], '#858f90');
      return;
    }

    if (item === 'diamond') {
      this.addItemBox(model, [0.19, 0.2, 0.1], [0, 0, 0], '#39c8c1', [0, 0, 0.18]);
      this.addItemBox(model, [0.1, 0.12, 0.112], [-0.06, 0.07, 0], '#9af1e6', [0, 0, 0.18]);
      this.addItemBox(model, [0.08, 0.08, 0.115], [0.075, -0.07, 0], '#1e858c', [0, 0, 0.18]);
      return;
    }

    if (item === 'wool') {
      this.addItemBox(model, [0.23, 0.23, 0.2], [0, 0, 0], '#dedbd0');
      this.addItemBox(model, [0.095, 0.095, 0.21], [-0.09, 0.09, 0], '#f3f0e6');
      this.addItemBox(model, [0.08, 0.08, 0.215], [0.09, -0.075, 0], '#c2c0b8');
      return;
    }

    if (item === 'leather') {
      this.addItemBox(model, [0.24, 0.19, 0.07], [0, 0, 0], '#8b572f', [0, 0, -0.1]);
      this.addItemBox(model, [0.11, 0.1, 0.076], [-0.095, 0.075, 0], '#bd7c4d', [0, 0, -0.1]);
      this.addItemBox(model, [0.09, 0.075, 0.078], [0.1, -0.07, 0], '#59331e', [0, 0, -0.1]);
      this.addItemBox(model, [0.045, 0.05, 0.08], [0.105, 0.085, 0], '#d09a69', [0, 0, -0.1]);
      return;
    }

    const rawIron = item === 'raw_iron';
    const base = rawIron ? '#a58a72' : '#303234';
    const light = rawIron ? '#cfaa83' : '#575a5b';
    const dark = rawIron ? '#6f5f52' : '#18191a';
    this.addItemBox(model, [0.2, 0.17, 0.15], [0, 0, 0], base);
    this.addItemBox(model, [0.115, 0.115, 0.16], [-0.075, 0.09, 0], light);
    this.addItemBox(model, [0.1, 0.09, 0.155], [0.085, -0.075, 0], dark);
    this.addItemBox(model, [0.065, 0.06, 0.165], [0.08, 0.075, 0], light);
  }

  private addItemBox(
    parent: Group,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    color: string,
    rotation: readonly [number, number, number] = [0, 0, 0]
  ): void {
    const geometry = new BoxGeometry(...size);
    const material = createHeldMaterial(color);
    const part = new Mesh(geometry, material);
    part.position.set(...position);
    part.rotation.set(...rotation);
    part.renderOrder = 21;
    this.itemGeometries.add(geometry);
    this.itemMaterials.add(material);
    parent.add(part);
  }

  private clearItemModel(): void {
    this.itemModel.clear();
    for (const geometry of this.itemGeometries) geometry.dispose();
    for (const material of this.itemMaterials) material.dispose();
    this.itemGeometries.clear();
    this.itemMaterials.clear();
  }

  private getHorizontalOffset(): number {
    const aspect = (this.camera as Camera & { aspect?: number }).aspect;
    if (typeof aspect !== 'number' || !Number.isFinite(aspect)) return 0.48;
    return Math.min(0.48, Math.max(0.16, aspect * 0.44));
  }

  private getViewportScale(): number {
    const aspect = (this.camera as Camera & { aspect?: number }).aspect;
    if (typeof aspect !== 'number' || !Number.isFinite(aspect)) return 1;
    return Math.min(1, Math.max(0.78, 0.65 + aspect * 0.35));
  }
}

interface ToolPalette {
  handle: string;
  handleLight: string;
  head: string;
  headLight: string;
  headDark: string;
  guard: string;
}

function createHeldMaterial(color: Color | string): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color,
    depthTest: false,
    depthWrite: false
  });
}

function adjustColor(color: Color | string, lightness: number): Color {
  const adjusted = color instanceof Color ? color.clone() : new Color(color);
  return adjusted.offsetHSL(0, 0, lightness);
}

function getToolPalette(tier: ToolDefinition['tier']): ToolPalette {
  const shared = {
    handle: '#73502d',
    handleLight: '#a77945'
  };
  if (tier === 'wood') {
    return {
      ...shared,
      head: '#9a6b38',
      headLight: '#c18a4b',
      headDark: '#654526',
      guard: '#76502c'
    };
  }
  if (tier === 'stone') {
    return {
      ...shared,
      head: '#85898a',
      headLight: '#b4b7b5',
      headDark: '#555a5c',
      guard: '#686b6b'
    };
  }
  if (tier === 'diamond') {
    return {
      ...shared,
      head: '#43cec6',
      headLight: '#9af1e6',
      headDark: '#1f858b',
      guard: '#278f94'
    };
  }
  return {
    ...shared,
    head: '#cbd4d3',
    headLight: '#f0f4ef',
    headDark: '#7d898b',
    guard: '#9ca8a8'
  };
}
