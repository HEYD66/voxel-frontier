import { BLOCK_DEFINITIONS } from './blocks';
import { BlockId, HOTBAR_BLOCKS } from './types';

type BlockCategory = 'nature' | 'building' | 'ore';

interface BlockPresentation {
  id: BlockId;
  name: string;
  label: string;
  category: BlockCategory;
  cssClass: string;
}

export type InventoryMode = 'creative' | 'survival';
export type CraftingContext = 'player' | 'table';
export type ContainerContext = 'player' | 'table' | 'furnace' | 'chest';
export type InventoryArea =
  | 'main'
  | 'hotbar'
  | 'chest'
  | 'crafting'
  | 'craft-output'
  | 'furnace-input'
  | 'furnace-fuel'
  | 'furnace-output'
  | 'armor'
  | 'offhand';
export type InventoryItemIcon =
  | 'block'
  | 'pickaxe'
  | 'axe'
  | 'shovel'
  | 'sword'
  | 'armor'
  | 'food'
  | 'material'
  | 'bucket'
  | 'generic';

export interface ItemDurability {
  current: number;
  max: number;
}

export interface InventoryItemStack {
  itemId: string | BlockId;
  label?: string;
  count: number;
  maxCount?: number;
  block?: BlockId;
  icon?: InventoryItemIcon;
  tint?: string;
  durability?: ItemDurability;
}

export interface SurvivalInventoryState {
  main: readonly (InventoryItemStack | null)[];
  hotbar: readonly (InventoryItemStack | null)[];
  crafting: readonly (InventoryItemStack | null)[];
  craftOutput: InventoryItemStack | null;
  armor?: readonly (InventoryItemStack | null)[];
  offhand?: InventoryItemStack | null;
  cursor?: InventoryItemStack | null;
}

export interface FurnaceInventoryState {
  input: InventoryItemStack | null;
  fuel: InventoryItemStack | null;
  output: InventoryItemStack | null;
  burnProgress: number;
  cookProgress: number;
  burning: boolean;
}

export type ChestInventorySize = 27 | 54;

export interface ChestInventoryState {
  slots: readonly (InventoryItemStack | null)[];
  size?: ChestInventorySize;
  title?: string;
}

export interface NormalizedChestInventoryState {
  slots: (InventoryItemStack | null)[];
  size: ChestInventorySize;
  title: string;
}

export interface RecipeIngredient {
  itemId: string | BlockId;
  count: number;
  label?: string;
}

export interface CraftingRecipe {
  id: string;
  label?: string;
  output: InventoryItemStack;
  ingredients: readonly RecipeIngredient[];
  pattern?: readonly (string | null)[];
  unlocked?: boolean;
  craftable?: boolean;
}

export interface SurvivalStatus extends VitalState {
  air: number;
  maxAir: number;
}

export interface DeathScreenOptions {
  title?: string;
  message?: string;
  score?: number;
  canRespawn?: boolean;
}

export interface GameUISettings {
  renderDistance: number;
  fov: number;
  sensitivity: number;
  volume: number;
  quality: 'fast' | 'balanced' | 'fancy';
  touchLayout: 'classic' | 'compact';
  showDebug: boolean;
}

export interface VitalState {
  health: number;
  hunger: number;
  armor: number;
  experience: number;
  level: number;
}

export type GameMenu = 'title' | 'pause' | 'settings' | 'new-world' | null;
export type SaveIndicatorState = 'idle' | 'saving' | 'saved' | 'error';

export type MobileActionDetail =
  | { action: 'move'; x: number; y: number; active: boolean }
  | { action: 'look'; dx: number; dy: number; active: boolean }
  | { action: 'jump' | 'crouch' | 'break' | 'place' | 'pause'; pressed: boolean };

export interface GameUIEventMap {
  start: undefined;
  resume: undefined;
  newworld: { seed?: number };
  save: undefined;
  title: undefined;
  inventorychange: { open: boolean };
  slotselect: { slot: number; block: BlockId; stack?: InventoryItemStack | null };
  blockselect: { slot: number; block: BlockId };
  inventorymodechange: { mode: InventoryMode };
  inventoryslotaction: {
    area: InventoryArea;
    index: number;
    button: 'primary' | 'secondary';
    shiftKey: boolean;
    doubleClick: boolean;
    stack: InventoryItemStack | null;
  };
  craftrequest: {
    source: 'output' | 'recipe-book';
    recipeId?: string;
    amount: 1 | 'max';
  };
  recipeselect: { recipeId: string };
  recipebookchange: { open: boolean };
  respawn: undefined;
  deathtitle: undefined;
  settingschange: {
    key: keyof GameUISettings;
    value: GameUISettings[keyof GameUISettings];
    settings: GameUISettings;
  };
  mobileaction: MobileActionDetail;
}

const CHINESE_BLOCK_LABELS: Record<BlockId, string> = {
  [BlockId.DiamondOre]: '钻石矿石',
  [BlockId.Air]: '空气',
  [BlockId.Grass]: '草方块',
  [BlockId.Dirt]: '泥土',
  [BlockId.Stone]: '石头',
  [BlockId.Sand]: '沙子',
  [BlockId.Wood]: '橡木原木',
  [BlockId.Leaves]: '橡树树叶',
  [BlockId.Planks]: '橡木木板',
  [BlockId.Bricks]: '砖块',
  [BlockId.Glass]: '玻璃',
  [BlockId.Water]: '水',
  [BlockId.CoalOre]: '煤矿石',
  [BlockId.IronOre]: '铁矿石',
  [BlockId.Snow]: '雪块',
  [BlockId.Cobblestone]: '圆石',
  [BlockId.Bedrock]: '基岩',
  [BlockId.CraftingTable]: '工作台',
  [BlockId.Furnace]: '熔炉',
  [BlockId.Torch]: '火把',
  [BlockId.Chest]: '箱子'
};

const ITEM_LABELS: Record<string, string> = {
  diamond: '钻石',
  diamond_pickaxe: '钻石镐',
  diamond_axe: '钻石斧',
  diamond_shovel: '钻石铲',
  diamond_sword: '钻石剑',
  diamond_helmet: '钻石头盔',
  diamond_chestplate: '钻石胸甲',
  diamond_leggings: '钻石护腿',
  diamond_boots: '钻石靴子',
  coal: '煤炭',
  raw_iron: '粗铁',
  iron_ingot: '铁锭',
  stick: '木棍',
  raw_pork: '生猪排',
  cooked_pork: '熟猪排',
  raw_mutton: '生羊肉',
  cooked_mutton: '熟羊肉',
  raw_beef: '生牛肉',
  cooked_beef: '牛排',
  wool: '羊毛',
  leather: '皮革',
  rotten_flesh: '腐肉',
  wooden_pickaxe: '木镐',
  stone_pickaxe: '石镐',
  iron_pickaxe: '铁镐',
  wooden_axe: '木斧',
  stone_axe: '石斧',
  iron_axe: '铁斧',
  wooden_shovel: '木锹',
  stone_shovel: '石锹',
  iron_shovel: '铁锹',
  wooden_sword: '木剑',
  stone_sword: '石剑',
  iron_sword: '铁剑',
  iron_helmet: '铁头盔',
  iron_chestplate: '铁胸甲',
  iron_leggings: '铁护腿',
  iron_boots: '铁靴子',
  leather_helmet: '皮革帽子',
  leather_tunic: '皮革上衣',
  leather_pants: '皮革裤子',
  leather_boots: '皮革靴子',
  wood_pickaxe: '木镐',
  wood_axe: '木斧',
  wood_shovel: '木锹'
};

const BUILDING_BLOCKS = new Set<BlockId>([
  BlockId.Cobblestone,
  BlockId.Planks,
  BlockId.Bricks,
  BlockId.Glass,
  BlockId.CraftingTable,
  BlockId.Furnace,
  BlockId.Torch
]);

const ORE_BLOCKS = new Set<BlockId>([
  BlockId.DiamondOre,
  BlockId.CoalOre,
  BlockId.IronOre,
  BlockId.Bedrock
]);

function getBlockDefinitionLabel(
  definition: (typeof BLOCK_DEFINITIONS)[number]
): string {
  const localized = (definition as typeof definition & { chineseLabel?: unknown }).chineseLabel;
  return typeof localized === 'string' && localized.trim().length > 0
    ? localized
    : CHINESE_BLOCK_LABELS[definition.id] ?? definition.label;
}

function getLegacyBlockCategory(block: BlockId): BlockCategory {
  if (BUILDING_BLOCKS.has(block)) return 'building';
  if (ORE_BLOCKS.has(block)) return 'ore';
  return 'nature';
}

const BLOCKS: readonly BlockPresentation[] = BLOCK_DEFINITIONS
  .filter((definition) => definition.id !== BlockId.Air)
  .map((definition) => ({
    id: definition.id,
    name: definition.name,
    label: getBlockDefinitionLabel(definition),
    category: definition.creativeCategory ?? getLegacyBlockCategory(definition.id),
    cssClass: 'block-' + definition.name.replaceAll('_', '-')
  }));

const DEFAULT_SETTINGS: GameUISettings = {
  renderDistance: 6,
  fov: 75,
  sensitivity: 1,
  volume: 70,
  quality: 'balanced',
  touchLayout: 'classic',
  showDebug: true
};

const UI_MARKUP = `
  <div class="ui-shade" aria-hidden="true"></div>

  <section class="loading-screen" role="status" aria-live="polite" aria-label="世界加载进度" hidden>
    <div class="loading-mark" aria-hidden="true">
      <span class="block-swatch block-grass block-swatch--large"></span>
    </div>
    <p class="loading-title" data-loading-label>正在生成世界</p>
    <div class="loading-track" aria-hidden="true">
      <span class="loading-fill" data-loading-fill></span>
    </div>
    <p class="loading-value" data-loading-value>0%</p>
  </section>

  <div class="hud" aria-hidden="true" hidden>
    <output class="debug-readout" aria-live="off" data-debug hidden>
      <span data-fps>-- FPS</span>
      <span data-coordinates>X -- / Y -- / Z --</span>
    </output>

    <output class="save-indicator" aria-live="polite" data-save-indicator hidden>
      <span class="save-indicator__glyph" aria-hidden="true"></span>
      <span data-save-text></span>
    </output>

    <div class="crosshair" aria-hidden="true">
      <i></i><b></b>
      <span class="attack-charge" data-attack-charge><em></em></span>
    </div>

    <div class="survival-bars" aria-hidden="true">
      <div class="armor-row" data-armor-row></div>
      <div class="air-row" data-air-row hidden></div>
      <div class="vitals-row">
        <div class="vital-group health-row" data-health-row></div>
        <div class="experience-wrap">
          <span class="experience-level" data-experience-level>1</span>
          <span class="experience-track"><i data-experience-fill></i></span>
        </div>
        <div class="vital-group hunger-row" data-hunger-row></div>
      </div>
    </div>

    <div class="tool-durability" data-tool-durability hidden>
      <span class="tool-durability__icon" aria-hidden="true"></span>
      <span class="tool-durability__name" data-tool-name></span>
      <span class="tool-durability__track" aria-hidden="true"><i data-tool-fill></i></span>
      <span class="tool-durability__value" data-tool-value></span>
    </div>

    <div class="pickup-feed" role="status" aria-live="polite" data-pickup-feed></div>

    <output class="block-label" aria-live="polite" data-block-label></output>
    <nav class="hotbar" aria-label="快捷栏" data-hotbar></nav>
  </div>

  <div class="touch-controls" aria-label="触屏控制">
    <div class="touch-look-zone" data-touch-look aria-label="拖动以转动视角"></div>

    <div class="touch-stick" data-touch-move role="application" aria-label="移动摇杆">
      <span class="touch-stick__ring" aria-hidden="true"></span>
      <span class="touch-stick__knob" data-touch-knob aria-hidden="true"></span>
    </div>

    <div class="touch-actions">
      <button class="touch-button touch-button--break" type="button" data-mobile-action="break" aria-label="破坏方块">
        <span class="touch-icon touch-icon--break" aria-hidden="true"></span>
      </button>
      <button class="touch-button touch-button--place" type="button" data-mobile-action="place" aria-label="放置方块">
        <span class="touch-icon touch-icon--place" aria-hidden="true"></span>
      </button>
      <button class="touch-button touch-button--jump" type="button" data-mobile-action="jump" aria-label="跳跃">
        <span class="touch-icon touch-icon--jump" aria-hidden="true"></span>
      </button>
      <button class="touch-button touch-button--crouch" type="button" data-mobile-action="crouch" aria-label="潜行">
        <span class="touch-icon touch-icon--crouch" aria-hidden="true"></span>
      </button>
    </div>

    <div class="touch-utility">
      <button class="touch-utility-button" type="button" data-touch-inventory aria-label="打开物品栏">
        <span class="touch-icon touch-icon--inventory" aria-hidden="true"></span>
      </button>
      <button class="touch-utility-button" type="button" data-touch-pause aria-label="暂停游戏">
        <span class="touch-icon touch-icon--pause" aria-hidden="true"></span>
      </button>
    </div>
  </div>

  <div class="menu-layer" data-menu-layer hidden>
    <section class="menu-panel title-panel" data-menu-panel="title" aria-labelledby="game-title" hidden>
      <div class="title-lockup">
        <span class="title-cube" aria-hidden="true">
          <span class="block-swatch block-grass block-swatch--title"></span>
        </span>
        <h1 id="game-title">方境</h1>
        <p>VOXEL FRONTIER</p>
        <span class="title-splash">生存，从第一块开始</span>
      </div>
      <div class="menu-actions title-actions">
        <button class="pixel-button pixel-button--primary" type="button" data-ui-action="start">开始游戏</button>
        <button class="pixel-button" type="button" data-ui-action="new-world">创建新世界</button>
        <button class="pixel-button" type="button" data-ui-action="settings">设置</button>
      </div>
      <p class="build-caption">浏览器方块沙盒 · 本地自动保存</p>
    </section>

    <section class="menu-panel pause-panel" data-menu-panel="pause" role="dialog" aria-modal="true" aria-labelledby="pause-title" hidden>
      <div class="panel-heading">
        <span class="panel-kicker">WORLD PAUSED</span>
        <h2 id="pause-title">游戏已暂停</h2>
      </div>
      <div class="menu-actions">
        <button class="pixel-button pixel-button--primary" type="button" data-ui-action="resume">继续游戏</button>
        <button class="pixel-button" type="button" data-ui-action="save">保存世界</button>
        <button class="pixel-button" type="button" data-ui-action="settings">设置</button>
        <button class="pixel-button pixel-button--danger" type="button" data-ui-action="title">保存并返回标题</button>
      </div>
    </section>

    <section class="menu-panel settings-panel" data-menu-panel="settings" role="dialog" aria-modal="true" aria-labelledby="settings-title" hidden>
      <header class="modal-header">
        <button class="icon-button" type="button" data-ui-action="back" aria-label="返回上一层">←</button>
        <div>
          <span class="panel-kicker">OPTIONS</span>
          <h2 id="settings-title">设置</h2>
        </div>
      </header>

      <div class="settings-list">
        <label class="setting-row">
          <span><b>渲染距离</b><small>更远的地形需要更多性能</small></span>
          <span class="setting-control">
            <input type="range" min="2" max="12" step="1" data-setting="renderDistance" aria-label="渲染距离">
            <output data-setting-output="renderDistance"></output>
          </span>
        </label>
        <label class="setting-row">
          <span><b>视野</b><small>调整镜头可见范围</small></span>
          <span class="setting-control">
            <input type="range" min="55" max="105" step="1" data-setting="fov" aria-label="视野">
            <output data-setting-output="fov"></output>
          </span>
        </label>
        <label class="setting-row">
          <span><b>鼠标灵敏度</b><small>控制视角转动速度</small></span>
          <span class="setting-control">
            <input type="range" min="0.2" max="2" step="0.1" data-setting="sensitivity" aria-label="鼠标灵敏度">
            <output data-setting-output="sensitivity"></output>
          </span>
        </label>
        <label class="setting-row">
          <span><b>音量</b><small>环境与方块音效</small></span>
          <span class="setting-control">
            <input type="range" min="0" max="100" step="1" data-setting="volume" aria-label="音量">
            <output data-setting-output="volume"></output>
          </span>
        </label>
        <label class="setting-row">
          <span><b>画面质量</b><small>阴影、雾与透明方块效果</small></span>
          <select data-setting="quality" aria-label="画面质量">
            <option value="fast">流畅</option>
            <option value="balanced">平衡</option>
            <option value="fancy">精美</option>
          </select>
        </label>
        <label class="setting-row">
          <span><b>触控布局</b><small>调整移动端按钮密度</small></span>
          <select data-setting="touchLayout" aria-label="触控布局">
            <option value="classic">经典</option>
            <option value="compact">紧凑</option>
          </select>
        </label>
        <label class="setting-row setting-row--toggle">
          <span><b>显示性能信息</b><small>在左上角显示帧率与坐标</small></span>
          <input class="pixel-toggle" type="checkbox" data-setting="showDebug" aria-label="显示性能信息">
        </label>
      </div>
    </section>

    <section class="menu-panel new-world-panel" data-menu-panel="new-world" role="dialog" aria-modal="true" aria-labelledby="new-world-title" hidden>
      <header class="modal-header">
        <button class="icon-button" type="button" data-ui-action="back" aria-label="返回标题">←</button>
        <div>
          <span class="panel-kicker">NEW WORLD</span>
          <h2 id="new-world-title">创建新世界</h2>
        </div>
      </header>
      <div class="world-form">
        <label>
          <span>世界种子</span>
          <input type="text" inputmode="numeric" autocomplete="off" placeholder="留空则随机生成" data-world-seed>
        </label>
        <button class="pixel-button pixel-button--small" type="button" data-ui-action="random-seed">随机种子</button>
        <div class="world-preview" aria-hidden="true">
          <span class="block-swatch block-grass"></span>
          <span class="block-swatch block-stone"></span>
          <span class="block-swatch block-wood"></span>
        </div>
        <p>新世界会替换当前本地存档。地形、树木和矿物会由种子确定。</p>
      </div>
      <button class="pixel-button pixel-button--primary" type="button" data-ui-action="confirm-new-world">生成世界</button>
    </section>
  </div>

  <section class="inventory-panel" role="dialog" aria-modal="true" aria-labelledby="inventory-title" aria-hidden="true" hidden>
    <header class="inventory-header">
      <div class="inventory-heading">
        <span class="panel-kicker" data-inventory-kicker>CREATIVE INVENTORY</span>
        <h2 id="inventory-title" data-inventory-title>创造物品栏</h2>
      </div>
      <div class="inventory-header-actions">
        <div class="inventory-mode-toggle" role="tablist" aria-label="物品栏模式">
          <button type="button" role="tab" aria-selected="true" data-inventory-mode="creative">创造</button>
          <button type="button" role="tab" aria-selected="false" data-inventory-mode="survival">生存</button>
        </div>
        <button class="icon-button" type="button" data-close-inventory aria-label="关闭物品栏">×</button>
      </div>
    </header>

    <div class="inventory-view creative-inventory" data-inventory-view="creative">
      <div class="inventory-tools">
        <div class="inventory-tabs" role="tablist" aria-label="物品分类">
          <button type="button" role="tab" aria-selected="true" data-inventory-category="all">全部</button>
          <button type="button" role="tab" aria-selected="false" data-inventory-category="nature">自然</button>
          <button type="button" role="tab" aria-selected="false" data-inventory-category="building">建造</button>
          <button type="button" role="tab" aria-selected="false" data-inventory-category="ore">矿物</button>
        </div>
        <label class="inventory-search">
          <span class="visually-hidden">搜索方块</span>
          <input type="search" autocomplete="off" placeholder="搜索方块" data-inventory-search>
          <i aria-hidden="true"></i>
        </label>
      </div>

      <div class="inventory-grid" role="grid" aria-label="可用方块" data-inventory-grid></div>
      <p class="inventory-empty" data-inventory-empty hidden>没有找到方块</p>
      <footer class="inventory-footer">
        <span>选择方块后会放入当前快捷栏槽位</span>
        <span data-inventory-selection>当前：草方块</span>
      </footer>
    </div>

    <div class="inventory-view survival-inventory" data-inventory-view="survival" hidden>
      <aside class="recipe-book" data-recipe-book aria-label="配方书" hidden>
        <header class="recipe-book__header">
          <div>
            <span class="panel-kicker">RECIPE BOOK</span>
            <h3>配方书</h3>
          </div>
          <button class="icon-button icon-button--small" type="button" data-close-recipe-book aria-label="关闭配方书">×</button>
        </header>
        <label class="inventory-search recipe-search">
          <span class="visually-hidden">搜索配方</span>
          <input type="search" autocomplete="off" placeholder="搜索配方" data-recipe-search>
          <i aria-hidden="true"></i>
        </label>
        <div class="recipe-list" data-recipe-list></div>
        <p class="recipe-empty" data-recipe-empty>还没有解锁配方</p>
      </aside>

      <div class="survival-inventory-main">
        <div class="survival-inventory-top">
          <section class="equipment-panel" aria-label="玩家装备">
            <div class="armor-slots" data-survival-armor></div>
            <div class="player-paperdoll" aria-hidden="true">
              <span class="player-paperdoll__head"></span>
              <span class="player-paperdoll__body"></span>
              <span class="player-paperdoll__arm player-paperdoll__arm--left"></span>
              <span class="player-paperdoll__arm player-paperdoll__arm--right"></span>
              <span class="player-paperdoll__leg player-paperdoll__leg--left"></span>
              <span class="player-paperdoll__leg player-paperdoll__leg--right"></span>
            </div>
            <div class="offhand-slot" data-survival-offhand></div>
          </section>

          <section class="crafting-panel" aria-labelledby="crafting-title">
            <header class="crafting-heading">
              <h3 id="crafting-title" data-crafting-title>合成</h3>
              <button class="recipe-toggle-button" type="button" data-recipe-toggle aria-label="打开配方书" aria-expanded="false" title="配方书">
                <span aria-hidden="true"></span>
              </button>
            </header>
            <div class="crafting-layout">
              <div class="crafting-grid" role="grid" aria-label="2乘2合成格" data-crafting-grid></div>
              <span class="crafting-arrow" aria-hidden="true"></span>
              <div class="crafting-output" data-crafting-output></div>
            </div>
          </section>

          <section class="chest-panel" aria-labelledby="chest-title" data-chest-panel hidden>
            <header class="chest-heading">
              <span class="panel-kicker">STORAGE</span>
              <h3 id="chest-title" data-chest-title>箱子</h3>
            </header>
            <div class="survival-slot-grid chest-slot-grid" role="grid" aria-label="箱子物品" data-chest-grid></div>
          </section>

          <section class="furnace-panel" aria-labelledby="furnace-title" data-furnace-panel hidden>
            <header class="furnace-heading">
              <span class="panel-kicker">SMELTING</span>
              <h3 id="furnace-title">冶炼</h3>
            </header>
            <div class="furnace-layout">
              <div class="furnace-source-slots">
                <div class="furnace-slot" role="grid" aria-label="熔炼输入" data-furnace-input></div>
                <span class="furnace-flame" aria-hidden="true">
                  <i data-furnace-burn></i>
                </span>
                <div class="furnace-slot" role="grid" aria-label="燃料" data-furnace-fuel></div>
              </div>
              <span class="furnace-arrow" aria-hidden="true">
                <i data-furnace-cook></i>
              </span>
              <div class="furnace-slot furnace-output" role="grid" aria-label="熔炼输出" data-furnace-output></div>
            </div>
          </section>
        </div>

        <section class="survival-storage" aria-label="生存物品栏">
          <h3>物品栏</h3>
          <div class="survival-slot-grid survival-main-grid" role="grid" aria-label="背包物品" data-survival-main></div>
          <h3 class="survival-hotbar-heading">快捷栏</h3>
          <div class="survival-slot-grid survival-hotbar-grid" role="grid" aria-label="快捷栏物品" data-survival-hotbar></div>
        </section>
      </div>

      <div class="cursor-stack" data-cursor-stack hidden></div>
    </div>
  </section>

  <section class="death-screen" role="dialog" aria-modal="true" aria-labelledby="death-title" hidden>
    <div class="death-screen__content">
      <span class="panel-kicker">YOU DIED</span>
      <h2 id="death-title" data-death-title>你死了</h2>
      <p data-death-message>世界仍在等待你。</p>
      <p class="death-score" data-death-score hidden></p>
      <div class="menu-actions">
        <button class="pixel-button pixel-button--primary" type="button" data-death-action="respawn">重生</button>
        <button class="pixel-button" type="button" data-death-action="title">返回标题</button>
      </div>
    </div>
  </section>

  <output class="toast" role="status" aria-live="polite" data-toast hidden></output>
`;

export class GameUI extends EventTarget {
  readonly element: HTMLDivElement;

  private readonly root: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly attackCharge: HTMLElement;
  private readonly menuLayer: HTMLElement;
  private readonly inventoryPanel: HTMLElement;
  private readonly creativeInventoryView: HTMLElement;
  private readonly survivalInventoryView: HTMLElement;
  private readonly hotbar: HTMLElement;
  private readonly inventoryGrid: HTMLElement;
  private readonly inventorySearch: HTMLInputElement;
  private readonly survivalMainGrid: HTMLElement;
  private readonly survivalHotbarGrid: HTMLElement;
  private readonly craftingGrid: HTMLElement;
  private readonly craftingOutput: HTMLElement;
  private readonly chestPanel: HTMLElement;
  private readonly chestTitle: HTMLElement;
  private readonly chestGrid: HTMLElement;
  private readonly furnacePanel: HTMLElement;
  private readonly furnaceInput: HTMLElement;
  private readonly furnaceFuel: HTMLElement;
  private readonly furnaceOutput: HTMLElement;
  private readonly furnaceBurn: HTMLElement;
  private readonly furnaceCook: HTMLElement;
  private readonly survivalArmor: HTMLElement;
  private readonly survivalOffhand: HTMLElement;
  private readonly recipeBook: HTMLElement;
  private readonly recipeSearch: HTMLInputElement;
  private readonly recipeList: HTMLElement;
  private readonly cursorStack: HTMLElement;
  private readonly blockLabel: HTMLOutputElement;
  private readonly toast: HTMLOutputElement;
  private readonly pickupFeed: HTMLElement;
  private readonly toolDurability: HTMLElement;
  private readonly airRow: HTMLElement;
  private readonly deathScreen: HTMLElement;
  private readonly loadingScreen: HTMLElement;
  private readonly loadingFill: HTMLElement;
  private readonly loadingValue: HTMLElement;
  private readonly loadingLabel: HTMLElement;
  private readonly debugReadout: HTMLOutputElement;
  private readonly saveIndicator: HTMLOutputElement;
  private readonly moveKnob: HTMLElement;
  private readonly seedInput: HTMLInputElement;

  private settings: GameUISettings = { ...DEFAULT_SETTINGS };
  private inventoryMode: InventoryMode = 'creative';
  private survivalInventory: SurvivalInventoryState = createDefaultSurvivalInventory();
  private chestInventory: NormalizedChestInventoryState = createDefaultChestInventory();
  private furnaceInventory: FurnaceInventoryState = createDefaultFurnaceInventory();
  private craftingContext: CraftingContext = 'player';
  private containerContext: ContainerContext = 'player';
  private craftingGridSize: 2 | 3 = 2;
  private recipes: CraftingRecipe[] = [];
  private recipeBookOpen = false;
  private deathVisible = false;
  private hotbarBlocks: BlockId[] = Array.from({ length: 9 }, (_, index) => {
    return HOTBAR_BLOCKS[index] ?? BlockId.Grass;
  });
  private selectedSlot = 0;
  private inventoryOpen = false;
  private activeMenu: GameMenu = 'title';
  private menuReturn: 'title' | 'pause' = 'title';
  private inventoryCategory: BlockCategory | 'all' = 'all';
  private statsAvailable = false;
  private previousFocus: HTMLElement | null = null;
  private toastTimer: number | undefined;
  private saveTimer: number | undefined;
  private loadingTimer: number | undefined;
  private labelTimer: number | undefined;
  private readonly cleanups: Array<() => void> = [];

  constructor(root: HTMLElement) {
    super();
    this.root = root;
    this.root.classList.add('game-shell');

    this.element = document.createElement('div');
    this.element.className = 'game-ui';
    this.element.dataset.menu = 'title';
    this.element.dataset.inventoryMode = this.inventoryMode;
    this.element.dataset.containerContext = this.containerContext;
    this.element.innerHTML = UI_MARKUP;
    this.root.append(this.element);

    this.hud = this.require<HTMLElement>('.hud');
    this.attackCharge = this.require<HTMLElement>('[data-attack-charge]');
    this.menuLayer = this.require<HTMLElement>('[data-menu-layer]');
    this.inventoryPanel = this.require<HTMLElement>('.inventory-panel');
    this.creativeInventoryView = this.require<HTMLElement>('[data-inventory-view="creative"]');
    this.survivalInventoryView = this.require<HTMLElement>('[data-inventory-view="survival"]');
    this.hotbar = this.require<HTMLElement>('[data-hotbar]');
    this.inventoryGrid = this.require<HTMLElement>('[data-inventory-grid]');
    this.inventorySearch = this.require<HTMLInputElement>('[data-inventory-search]');
    this.survivalMainGrid = this.require<HTMLElement>('[data-survival-main]');
    this.survivalHotbarGrid = this.require<HTMLElement>('[data-survival-hotbar]');
    this.craftingGrid = this.require<HTMLElement>('[data-crafting-grid]');
    this.craftingOutput = this.require<HTMLElement>('[data-crafting-output]');
    this.chestPanel = this.require<HTMLElement>('[data-chest-panel]');
    this.chestTitle = this.require<HTMLElement>('[data-chest-title]');
    this.chestGrid = this.require<HTMLElement>('[data-chest-grid]');
    this.furnacePanel = this.require<HTMLElement>('[data-furnace-panel]');
    this.furnaceInput = this.require<HTMLElement>('[data-furnace-input]');
    this.furnaceFuel = this.require<HTMLElement>('[data-furnace-fuel]');
    this.furnaceOutput = this.require<HTMLElement>('[data-furnace-output]');
    this.furnaceBurn = this.require<HTMLElement>('[data-furnace-burn]');
    this.furnaceCook = this.require<HTMLElement>('[data-furnace-cook]');
    this.survivalArmor = this.require<HTMLElement>('[data-survival-armor]');
    this.survivalOffhand = this.require<HTMLElement>('[data-survival-offhand]');
    this.recipeBook = this.require<HTMLElement>('[data-recipe-book]');
    this.recipeSearch = this.require<HTMLInputElement>('[data-recipe-search]');
    this.recipeList = this.require<HTMLElement>('[data-recipe-list]');
    this.cursorStack = this.require<HTMLElement>('[data-cursor-stack]');
    this.blockLabel = this.require<HTMLOutputElement>('[data-block-label]');
    this.toast = this.require<HTMLOutputElement>('[data-toast]');
    this.pickupFeed = this.require<HTMLElement>('[data-pickup-feed]');
    this.toolDurability = this.require<HTMLElement>('[data-tool-durability]');
    this.airRow = this.require<HTMLElement>('[data-air-row]');
    this.deathScreen = this.require<HTMLElement>('.death-screen');
    this.loadingScreen = this.require<HTMLElement>('.loading-screen');
    this.loadingFill = this.require<HTMLElement>('[data-loading-fill]');
    this.loadingValue = this.require<HTMLElement>('[data-loading-value]');
    this.loadingLabel = this.require<HTMLElement>('[data-loading-label]');
    this.debugReadout = this.require<HTMLOutputElement>('[data-debug]');
    this.saveIndicator = this.require<HTMLOutputElement>('[data-save-indicator]');
    this.moveKnob = this.require<HTMLElement>('[data-touch-knob]');
    this.seedInput = this.require<HTMLInputElement>('[data-world-seed]');

    this.renderVitals();
    this.renderHotbar();
    this.renderInventory();
    this.renderSurvivalInventory();
    this.renderFurnaceInventory();
    this.renderRecipes();
    this.syncInventoryMode();
    this.renderSettings();
    this.bindMenuActions();
    this.bindInventory();
    this.bindSurvivalInventory();
    this.bindDeathScreen();
    this.bindSettings();
    this.bindTouchControls();
    this.showMenu('title');
    this.setHudVisible(false);
  }

  on<K extends keyof GameUIEventMap>(
    type: K,
    listener: (detail: GameUIEventMap[K]) => void
  ): () => void {
    const wrapped = (event: Event): void => {
      listener((event as CustomEvent<GameUIEventMap[K]>).detail);
    };
    this.addEventListener(type, wrapped);
    return () => this.removeEventListener(type, wrapped);
  }

  showMenu(menu: GameMenu): void {
    this.activeMenu = menu;
    this.element.dataset.menu = menu ?? 'none';
    this.menuLayer.hidden = menu === null;
    this.menuLayer.setAttribute('aria-hidden', String(menu === null));

    const panels = this.element.querySelectorAll<HTMLElement>('[data-menu-panel]');
    panels.forEach((panel) => {
      const isActive = panel.dataset.menuPanel === menu;
      panel.hidden = !isActive;
      panel.inert = !isActive;
    });

    if (menu === 'title') {
      this.setHudVisible(false);
    } else if (menu === 'pause') {
      this.setHudVisible(true);
    }

    this.updateModalState();

    if (menu !== null) {
      window.requestAnimationFrame(() => {
        const activePanel = this.element.querySelector<HTMLElement>(
          '[data-menu-panel="' + menu + '"]'
        );
        activePanel?.querySelector<HTMLElement>('button, input, select')?.focus();
      });
    }
  }

  showTitle(visible: boolean, hasSavedWorld = false): void {
    const startButton = this.require<HTMLButtonElement>('[data-ui-action="start"]');
    startButton.textContent = hasSavedWorld ? '继续上次世界' : '开始游戏';

    if (visible) {
      this.hideDeath();
      this.setInventoryOpen(false);
      this.showMenu('title');
      this.setHudVisible(false);
    } else if (this.activeMenu === 'title') {
      this.showMenu(null);
    }
  }

  showPause(visible: boolean): void {
    if (visible) {
      this.setInventoryOpen(false);
      this.showMenu('pause');
      this.setHudVisible(true);
    } else if (
      this.activeMenu === 'pause' ||
      (this.activeMenu === 'settings' && this.menuReturn === 'pause')
    ) {
      this.showMenu(null);
    }
  }

  showLoading(visible: boolean): void {
    this.loadingScreen.hidden = !visible;
    this.loadingScreen.setAttribute('aria-hidden', String(!visible));
    this.element.classList.toggle('is-loading', visible);
    this.updateModalState();
  }

  setLoadingProgress(progress: number, label = '正在生成世界'): void {
    const normalized = Math.min(1, Math.max(0, progress > 1 ? progress / 100 : progress));
    const percent = Math.round(normalized * 100);
    this.loadingFill.style.width = percent + '%';
    this.loadingValue.textContent = percent + '%';
    this.loadingLabel.textContent = label;
    this.showLoading(true);

    if (this.loadingTimer !== undefined) {
      window.clearTimeout(this.loadingTimer);
    }
    if (normalized >= 1) {
      this.loadingTimer = window.setTimeout(() => this.showLoading(false), 420);
    }
  }

  setHudVisible(visible: boolean): void {
    this.hud.hidden = !visible;
    this.hud.setAttribute('aria-hidden', String(!visible));
  }

  setInventoryOpen(open: boolean): void {
    if (this.inventoryOpen === open) {
      return;
    }

    this.inventoryOpen = open;
    this.inventoryPanel.hidden = !open;
    this.inventoryPanel.inert = !open;
    this.inventoryPanel.setAttribute('aria-hidden', String(!open));

    if (open) {
      this.previousFocus = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      if (this.inventoryMode === 'creative') {
        this.inventorySearch.value = '';
        this.inventoryCategory = 'all';
        this.syncInventoryTabs();
        this.renderInventory();
        window.requestAnimationFrame(() => this.inventorySearch.focus());
      } else {
        this.renderSurvivalInventory();
        this.renderRecipes();
        window.requestAnimationFrame(() => {
          this.survivalInventoryView
            .querySelector<HTMLElement>('button, input')
            ?.focus();
        });
      }
    } else {
      this.setRecipeBookOpen(false);
      this.previousFocus?.focus();
      this.previousFocus = null;
    }

    this.updateModalState();
  }

  toggleInventory(): boolean {
    const next = !this.inventoryOpen;
    this.setInventoryOpen(next);
    this.emit('inventorychange', { open: next });
    return next;
  }

  isInventoryOpen(): boolean {
    return this.inventoryOpen;
  }

  getCurrentMenu(): GameMenu {
    return this.activeMenu;
  }

  setInventoryMode(mode: InventoryMode): void {
    this.inventoryMode = mode;
    this.element.dataset.inventoryMode = mode;
    this.syncInventoryMode();
    this.renderHotbar();
    this.setSelectedSlot(this.selectedSlot);

    if (this.inventoryOpen) {
      window.requestAnimationFrame(() => {
        const activeView = mode === 'creative' && this.containerContext === 'player'
          ? this.creativeInventoryView
          : this.survivalInventoryView;
        activeView.querySelector<HTMLElement>('button, input')?.focus();
      });
    }
  }

  getInventoryMode(): InventoryMode {
    return this.inventoryMode;
  }

  setSurvivalInventory(state: SurvivalInventoryState): void {
    const craftingSlotCount = this.craftingGridSize * this.craftingGridSize;
    this.survivalInventory = {
      main: normalizeStacks(state.main, 27),
      hotbar: normalizeStacks(state.hotbar, 9),
      crafting: normalizeStacks(state.crafting, craftingSlotCount),
      craftOutput: cloneItemStack(state.craftOutput),
      armor: normalizeStacks(state.armor ?? [], 4),
      offhand: cloneItemStack(state.offhand ?? null),
      cursor: cloneItemStack(state.cursor ?? null)
    };
    this.renderSurvivalInventory();
    if (this.inventoryMode === 'survival') {
      this.renderHotbar();
      this.setSelectedSlot(this.selectedSlot);
    }
  }

  getSurvivalInventory(): SurvivalInventoryState {
    return cloneSurvivalInventory(
      this.survivalInventory,
      this.craftingGridSize * this.craftingGridSize
    );
  }

  setChestInventory(state: ChestInventoryState): void {
    this.chestInventory = normalizeChestInventoryState(state);
    this.renderChestInventory();
  }

  getChestInventory(): ChestInventoryState {
    return normalizeChestInventoryState(this.chestInventory);
  }

  setCraftingGrid(
    crafting: readonly (InventoryItemStack | null)[],
    output: InventoryItemStack | null,
    size: 2 | 3 = 2
  ): void {
    this.craftingGridSize = size;
    this.craftingContext = size === 3 ? 'table' : 'player';
    this.survivalInventory = {
      ...this.survivalInventory,
      crafting: normalizeStacks(crafting, size * size),
      craftOutput: cloneItemStack(output)
    };
    this.renderCraftingSlots();
  }

  setCraftingContext(context: CraftingContext): void {
    this.craftingContext = context;
    this.craftingGridSize = context === 'table' ? 3 : 2;
    this.element.dataset.craftingContext = context;
    if (this.containerContext === 'player' || this.containerContext === 'table') {
      this.setContainerContext(context);
    }
    this.survivalInventory = {
      ...this.survivalInventory,
      crafting: normalizeStacks(
        this.survivalInventory.crafting,
        this.craftingGridSize * this.craftingGridSize
      )
    };
    this.renderCraftingSlots();
  }

  getCraftingContext(): CraftingContext {
    return this.craftingContext;
  }

  setContainerContext(context: ContainerContext): void {
    this.containerContext = context;
    this.element.dataset.containerContext = context;
    this.survivalInventoryView.dataset.containerContext = context;
    const furnaceOpen = context === 'furnace';
    const chestOpen = context === 'chest';
    const containerOpen = furnaceOpen || chestOpen;
    for (const selector of ['.equipment-panel', '.crafting-panel']) {
      const panel = this.require<HTMLElement>(selector);
      panel.hidden = containerOpen;
      panel.inert = containerOpen;
    }
    this.furnacePanel.hidden = context !== 'furnace';
    this.furnacePanel.inert = context !== 'furnace';
    this.chestPanel.hidden = context !== 'chest';
    this.chestPanel.inert = context !== 'chest';
    if (containerOpen) this.setRecipeBookOpen(false);
    this.syncInventoryMode();
    this.renderChestInventory();
    this.renderFurnaceInventory();
  }

  getContainerContext(): ContainerContext {
    return this.containerContext;
  }

  setFurnaceInventory(state: FurnaceInventoryState): void {
    this.furnaceInventory = {
      input: cloneItemStack(state.input),
      fuel: cloneItemStack(state.fuel),
      output: cloneItemStack(state.output),
      burnProgress: normalizeProgress(state.burnProgress),
      cookProgress: normalizeProgress(state.cookProgress),
      burning: Boolean(state.burning)
    };
    this.renderFurnaceInventory();
  }

  setFurnaceProgress(burnProgress: number, cookProgress: number, burning: boolean): void {
    this.furnaceInventory = {
      ...this.furnaceInventory,
      burnProgress: normalizeProgress(burnProgress),
      cookProgress: normalizeProgress(cookProgress),
      burning: Boolean(burning)
    };
    this.renderFurnaceProgress();
  }

  setRecipes(recipes: readonly CraftingRecipe[]): void {
    this.recipes = recipes.map(cloneRecipe);
    this.renderRecipes();
  }

  setRecipeBookOpen(open: boolean): void {
    this.recipeBookOpen =
      open &&
      this.inventoryMode === 'survival' &&
      this.containerContext !== 'furnace' &&
      this.containerContext !== 'chest';
    this.recipeBook.hidden = !this.recipeBookOpen;
    this.recipeBook.inert = !this.recipeBookOpen;
    this.survivalInventoryView.classList.toggle('has-recipe-book', this.recipeBookOpen);
    const toggle = this.require<HTMLButtonElement>('[data-recipe-toggle]');
    toggle.setAttribute('aria-expanded', String(this.recipeBookOpen));
    toggle.setAttribute('aria-label', this.recipeBookOpen ? '关闭配方书' : '打开配方书');

    if (this.recipeBookOpen) {
      this.recipeSearch.value = '';
      this.renderRecipes();
      window.requestAnimationFrame(() => this.recipeSearch.focus());
    }
  }

  isRecipeBookOpen(): boolean {
    return this.recipeBookOpen;
  }

  setSelectedSlot(slot: number, label?: string): void {
    this.selectedSlot = Math.min(8, Math.max(0, Math.trunc(slot)));
    const buttons = this.hotbar.querySelectorAll<HTMLButtonElement>('.hotbar-slot');
    buttons.forEach((button, index) => {
      const selected = index === this.selectedSlot;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-current', selected ? 'true' : 'false');
    });

    const stack = this.getSelectedStack();
    const block = stack?.block ??
      (typeof stack?.itemId === 'number' ? stack.itemId : undefined) ??
      this.hotbarBlocks[this.selectedSlot] ??
      BlockId.Grass;
    const presentation = getBlockPresentation(block);
    const selectedLabel = stack
      ? getItemLabel(stack)
      : this.inventoryMode === 'survival'
        ? '空手'
        : presentation.label;
    this.require<HTMLElement>('[data-inventory-selection]').textContent =
      '当前：' + selectedLabel;
    this.setBlockLabel(label ?? selectedLabel);
    if (stack?.durability) {
      this.setSelectedToolDurability(
        stack.durability.current,
        stack.durability.max,
        selectedLabel
      );
    } else {
      this.toolDurability.hidden = true;
    }
  }

  getSelectedSlot(): number {
    return this.selectedSlot;
  }

  getSelectedBlock(): BlockId {
    const stack = this.getSelectedStack();
    if (this.inventoryMode === 'survival') {
      return stack?.block ??
        (typeof stack?.itemId === 'number' ? stack.itemId : BlockId.Air);
    }
    return this.hotbarBlocks[this.selectedSlot] ?? BlockId.Grass;
  }

  getSelectedStack(): InventoryItemStack | null {
    if (this.inventoryMode !== 'survival') return null;
    return cloneItemStack(this.survivalInventory.hotbar[this.selectedSlot] ?? null);
  }

  getHotbarBlocks(): readonly BlockId[] {
    if (this.inventoryMode !== 'survival') return [...this.hotbarBlocks];
    return Array.from({ length: 9 }, (_, index) => {
      const stack = this.survivalInventory.hotbar[index];
      return stack?.block ??
        (typeof stack?.itemId === 'number' ? stack.itemId : BlockId.Air);
    });
  }

  setHotbarBlocks(blocks: readonly BlockId[]): void {
    this.hotbarBlocks = Array.from({ length: 9 }, (_, index) => {
      return blocks[index] ?? HOTBAR_BLOCKS[index] ?? BlockId.Grass;
    });
    this.survivalInventory = {
      ...this.survivalInventory,
      hotbar: this.hotbarBlocks.map((block, index) => {
        const existing = this.survivalInventory.hotbar[index];
        return existing?.block === block ? cloneItemStack(existing) : createBlockStack(block, 64);
      })
    };
    this.renderHotbar();
    this.renderSurvivalInventory();
    this.setSelectedSlot(this.selectedSlot);
  }

  setBlockLabel(label: string): void {
    this.blockLabel.textContent = label;
    this.blockLabel.classList.toggle('is-visible', label.trim().length > 0);

    if (this.labelTimer !== undefined) {
      window.clearTimeout(this.labelTimer);
    }
    if (label.trim().length > 0) {
      this.labelTimer = window.setTimeout(() => {
        this.blockLabel.classList.remove('is-visible');
      }, 1500);
    }
  }

  showToast(message: string, tone: 'default' | 'success' | 'warning' = 'default'): void {
    this.toast.textContent = message;
    this.toast.dataset.tone = tone;
    this.toast.hidden = false;
    this.toast.classList.remove('is-visible');
    window.requestAnimationFrame(() => this.toast.classList.add('is-visible'));

    if (this.toastTimer !== undefined) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => {
      this.toast.classList.remove('is-visible');
      window.setTimeout(() => {
        this.toast.hidden = true;
      }, 180);
    }, 2200);
  }

  showPickup(stack: InventoryItemStack, amount = stack.count): void {
    const pickup = document.createElement('div');
    pickup.className = 'pickup-entry';
    pickup.append(createItemVisual(stack, 'pickup-entry__icon'));

    const copy = document.createElement('span');
    copy.textContent = '+' + Math.max(1, Math.trunc(amount)) + ' ' + getItemLabel(stack);
    pickup.append(copy);
    this.pickupFeed.append(pickup);

    while (this.pickupFeed.childElementCount > 4) {
      this.pickupFeed.firstElementChild?.remove();
    }

    window.requestAnimationFrame(() => pickup.classList.add('is-visible'));
    window.setTimeout(() => {
      pickup.classList.remove('is-visible');
      window.setTimeout(() => pickup.remove(), 180);
    }, 1800);
  }

  setSelectedToolDurability(
    current: number,
    max: number,
    label = '当前工具'
  ): void {
    if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) {
      this.toolDurability.hidden = true;
      return;
    }

    const normalizedCurrent = Math.min(max, Math.max(0, current));
    const ratio = normalizedCurrent / max;
    this.require<HTMLElement>('[data-tool-name]').textContent = label;
    this.require<HTMLElement>('[data-tool-fill]').style.width = ratio * 100 + '%';
    this.require<HTMLElement>('[data-tool-value]').textContent =
      Math.ceil(normalizedCurrent) + ' / ' + Math.ceil(max);
    this.toolDurability.dataset.level = ratio <= 0.15 ? 'critical' : ratio <= 0.35 ? 'low' : 'normal';
    this.toolDurability.hidden = false;
  }

  setAttackCharge(progress: number): void {
    const normalized = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
    this.attackCharge.style.setProperty('--attack-charge', normalized * 100 + '%');
    this.attackCharge.classList.toggle('is-charged', normalized >= 0.999);
  }

  setStats(
    fps: number,
    coordinates: readonly [number, number, number],
    visible = true
  ): void {
    this.statsAvailable = visible;
    this.require<HTMLElement>('[data-fps]').textContent = Math.round(fps) + ' FPS';
    this.require<HTMLElement>('[data-coordinates]').textContent =
      'X ' + coordinates[0].toFixed(1) +
      ' / Y ' + coordinates[1].toFixed(1) +
      ' / Z ' + coordinates[2].toFixed(1);
    this.renderStatsVisibility();
  }

  setSaveIndicator(state: SaveIndicatorState): void {
    if (this.saveTimer !== undefined) {
      window.clearTimeout(this.saveTimer);
    }

    if (state === 'idle') {
      this.saveIndicator.hidden = true;
      return;
    }

    const labels: Record<Exclude<SaveIndicatorState, 'idle'>, string> = {
      saving: '正在保存',
      saved: '世界已保存',
      error: '保存失败'
    };
    this.saveIndicator.dataset.state = state;
    this.require<HTMLElement>('[data-save-text]').textContent = labels[state];
    this.saveIndicator.hidden = false;

    if (state === 'saved') {
      this.saveTimer = window.setTimeout(() => {
        this.saveIndicator.hidden = true;
      }, 1800);
    }
  }

  setVitals(state: Partial<VitalState>): void {
    const current: VitalState = {
      health: Number(this.hud.dataset.health ?? 20),
      hunger: Number(this.hud.dataset.hunger ?? 20),
      armor: Number(this.hud.dataset.armor ?? 0),
      experience: Number(this.hud.dataset.experience ?? 0),
      level: Number(this.hud.dataset.level ?? 1),
      ...state
    };

    this.hud.dataset.health = String(current.health);
    this.hud.dataset.hunger = String(current.hunger);
    this.hud.dataset.armor = String(current.armor);
    this.hud.dataset.experience = String(current.experience);
    this.hud.dataset.level = String(current.level);

    this.updateVitalIcons('[data-health-row] .vital-icon', current.health);
    this.updateVitalIcons('[data-hunger-row] .vital-icon', current.hunger);
    this.updateVitalIcons('[data-armor-row] .vital-icon', current.armor);
    this.require<HTMLElement>('[data-experience-fill]').style.width =
      Math.min(1, Math.max(0, current.experience)) * 100 + '%';
    this.require<HTMLElement>('[data-experience-level]').textContent =
      String(Math.max(0, Math.trunc(current.level)));
  }

  setAir(air: number, maxAir = 20, visible = air < maxAir): void {
    const normalizedMax = Math.max(1, Number.isFinite(maxAir) ? maxAir : 20);
    const normalizedAir = Math.min(
      normalizedMax,
      Math.max(0, Number.isFinite(air) ? air : normalizedMax)
    );
    this.hud.dataset.air = String(normalizedAir);
    this.hud.dataset.maxAir = String(normalizedMax);
    this.updateVitalIcons(
      '[data-air-row] .vital-icon',
      normalizedAir / normalizedMax * 20
    );
    this.airRow.hidden = !visible;
  }

  setSurvivalStatus(status: Partial<SurvivalStatus>): void {
    this.setVitals(status);
    if (status.air !== undefined || status.maxAir !== undefined) {
      const maxAir = status.maxAir ?? Number(this.hud.dataset.maxAir ?? 20);
      const air = status.air ?? Number(this.hud.dataset.air ?? maxAir);
      this.setAir(air, maxAir, air < maxAir);
    }
  }

  showDeath(options: DeathScreenOptions = {}): void {
    this.deathVisible = true;
    this.setInventoryOpen(false);
    this.showMenu(null);
    this.require<HTMLElement>('[data-death-title]').textContent = options.title ?? '你死了';
    this.require<HTMLElement>('[data-death-message]').textContent =
      options.message ?? '世界仍在等待你。';
    const score = this.require<HTMLElement>('[data-death-score]');
    score.hidden = options.score === undefined;
    score.textContent = options.score === undefined
      ? ''
      : '得分：' + Math.max(0, Math.trunc(options.score));
    const respawn = this.require<HTMLButtonElement>('[data-death-action="respawn"]');
    respawn.hidden = options.canRespawn === false;
    respawn.disabled = options.canRespawn === false;
    this.deathScreen.hidden = false;
    this.deathScreen.inert = false;
    this.element.classList.add('is-dead');
    this.updateModalState();
    window.requestAnimationFrame(() => {
      (options.canRespawn === false
        ? this.require<HTMLButtonElement>('[data-death-action="title"]')
        : respawn
      ).focus();
    });
  }

  hideDeath(): void {
    this.deathVisible = false;
    this.deathScreen.hidden = true;
    this.deathScreen.inert = true;
    this.element.classList.remove('is-dead');
    this.updateModalState();
  }

  getSettings(): GameUISettings {
    return { ...this.settings };
  }

  setSettings(settings: Partial<GameUISettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.renderSettings();
    this.renderStatsVisibility();
    this.element.dataset.touchLayout = this.settings.touchLayout;
  }

  destroy(): void {
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    if (this.toastTimer !== undefined) window.clearTimeout(this.toastTimer);
    if (this.saveTimer !== undefined) window.clearTimeout(this.saveTimer);
    if (this.loadingTimer !== undefined) window.clearTimeout(this.loadingTimer);
    if (this.labelTimer !== undefined) window.clearTimeout(this.labelTimer);
    this.element.remove();
    if (!this.root.querySelector('.game-ui')) {
      this.root.classList.remove('game-shell');
    }
  }

  private require<T extends Element>(selector: string): T {
    const element = this.element.querySelector<T>(selector);
    if (!element) {
      throw new Error('GameUI element missing: ' + selector);
    }
    return element;
  }

  private emit<K extends keyof GameUIEventMap>(type: K, detail: GameUIEventMap[K]): void {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  private bindMenuActions(): void {
    this.element.querySelectorAll<HTMLButtonElement>('[data-ui-action]').forEach((button) => {
      const handler = (): void => {
        const action = button.dataset.uiAction;
        switch (action) {
          case 'start':
            this.showMenu(null);
            this.setHudVisible(true);
            this.emit('start', undefined);
            break;
          case 'resume':
            this.showMenu(null);
            this.emit('resume', undefined);
            break;
          case 'new-world':
            this.menuReturn = 'title';
            this.showMenu('new-world');
            break;
          case 'confirm-new-world': {
            const rawSeed = this.seedInput.value.trim();
            const parsedSeed = rawSeed.length > 0 ? Number.parseInt(rawSeed, 10) : undefined;
            const seed = parsedSeed !== undefined && Number.isFinite(parsedSeed)
              ? parsedSeed
              : undefined;
            this.showMenu(null);
            this.setHudVisible(false);
            this.setLoadingProgress(0, '正在生成新世界');
            this.emit('newworld', { seed });
            break;
          }
          case 'random-seed':
            this.seedInput.value = String(Math.floor(Math.random() * 2_147_483_647));
            this.seedInput.focus();
            this.seedInput.select();
            break;
          case 'save':
            this.setSaveIndicator('saving');
            this.emit('save', undefined);
            break;
          case 'title':
            this.emit('title', undefined);
            this.showTitle(true, true);
            break;
          case 'settings':
            this.menuReturn = this.activeMenu === 'pause' ? 'pause' : 'title';
            this.showMenu('settings');
            break;
          case 'back':
            this.showMenu(this.menuReturn);
            break;
          default:
            break;
        }
      };
      button.addEventListener('click', handler);
      this.cleanups.push(() => button.removeEventListener('click', handler));
    });
  }

  private bindInventory(): void {
    const closeButton = this.require<HTMLButtonElement>('[data-close-inventory]');
    const closeHandler = (): void => {
      this.setInventoryOpen(false);
      this.emit('inventorychange', { open: false });
    };
    closeButton.addEventListener('click', closeHandler);
    this.cleanups.push(() => closeButton.removeEventListener('click', closeHandler));

    const searchHandler = (): void => this.renderInventory();
    this.inventorySearch.addEventListener('input', searchHandler);
    this.cleanups.push(() => this.inventorySearch.removeEventListener('input', searchHandler));

    const hotbarHandler = (event: MouseEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLButtonElement>('.hotbar-slot[data-slot]');
      if (!button || !this.hotbar.contains(button)) return;

      const index = Number(button.dataset.slot);
      if (!Number.isInteger(index) || index < 0 || index >= 9) return;
      const stack = this.inventoryMode === 'survival'
        ? this.survivalInventory.hotbar[index] ?? null
        : null;
      const block = stack?.block ??
        (typeof stack?.itemId === 'number' ? stack.itemId : undefined) ??
        this.hotbarBlocks[index] ??
        BlockId.Grass;
      this.setSelectedSlot(index);
      this.emit('slotselect', {
        slot: index,
        block,
        stack: cloneItemStack(stack)
      });
    };
    this.hotbar.addEventListener('click', hotbarHandler);
    this.cleanups.push(() => this.hotbar.removeEventListener('click', hotbarHandler));

    const inventoryGridHandler = (event: MouseEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLButtonElement>('.inventory-slot[data-block-id]');
      if (!button || !this.inventoryGrid.contains(button)) return;
      const block = BLOCKS.find((candidate) => String(candidate.id) === button.dataset.blockId);
      if (!block) return;

      this.hotbarBlocks[this.selectedSlot] = block.id;
      this.renderHotbar();
      this.setSelectedSlot(this.selectedSlot, block.label);
      this.emit('blockselect', { slot: this.selectedSlot, block: block.id });
      this.emit('slotselect', { slot: this.selectedSlot, block: block.id });
    };
    this.inventoryGrid.addEventListener('click', inventoryGridHandler);
    this.cleanups.push(() => {
      this.inventoryGrid.removeEventListener('click', inventoryGridHandler);
    });

    this.element
      .querySelectorAll<HTMLButtonElement>('[data-inventory-category]')
      .forEach((button) => {
        const handler = (): void => {
          const category = button.dataset.inventoryCategory;
          if (
            category === 'all' ||
            category === 'nature' ||
            category === 'building' ||
            category === 'ore'
          ) {
            this.inventoryCategory = category;
            this.syncInventoryTabs();
            this.renderInventory();
          }
        };
        button.addEventListener('click', handler);
        this.cleanups.push(() => button.removeEventListener('click', handler));
      });

    this.element
      .querySelectorAll<HTMLButtonElement>('[data-inventory-mode]')
      .forEach((button) => {
        const handler = (): void => {
          const mode = button.dataset.inventoryMode;
          if (mode !== 'creative' && mode !== 'survival') return;
          this.setInventoryMode(mode);
          this.emit('inventorymodechange', { mode });
        };
        button.addEventListener('click', handler);
        this.cleanups.push(() => button.removeEventListener('click', handler));
      });
  }

  private bindSurvivalInventory(): void {
    const recipeToggle = this.require<HTMLButtonElement>('[data-recipe-toggle]');
    const toggleHandler = (): void => {
      const open = !this.recipeBookOpen;
      this.setRecipeBookOpen(open);
      this.emit('recipebookchange', { open });
    };
    recipeToggle.addEventListener('click', toggleHandler);
    this.cleanups.push(() => recipeToggle.removeEventListener('click', toggleHandler));

    const closeRecipe = this.require<HTMLButtonElement>('[data-close-recipe-book]');
    const closeRecipeHandler = (): void => {
      this.setRecipeBookOpen(false);
      this.emit('recipebookchange', { open: false });
    };
    closeRecipe.addEventListener('click', closeRecipeHandler);
    this.cleanups.push(() => closeRecipe.removeEventListener('click', closeRecipeHandler));

    const recipeSearchHandler = (): void => this.renderRecipes();
    this.recipeSearch.addEventListener('input', recipeSearchHandler);
    this.cleanups.push(() => this.recipeSearch.removeEventListener('input', recipeSearchHandler));

    const clickHandler = (event: MouseEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      const recipeButton = target?.closest<HTMLButtonElement>('[data-recipe-id]');
      if (recipeButton && this.recipeList.contains(recipeButton)) {
        const recipeId = recipeButton.dataset.recipeId;
        if (!recipeId) return;
        const recipe = this.recipes.find((candidate) => candidate.id === recipeId);
        this.emit('recipeselect', { recipeId });
        if (recipe?.craftable !== false && recipe?.unlocked !== false) {
          this.emit('craftrequest', {
            source: 'recipe-book',
            recipeId,
            amount: event.shiftKey ? 'max' : 1
          });
        }
        return;
      }

      const slot = target?.closest<HTMLButtonElement>('[data-inventory-area]');
      if (!slot || !this.survivalInventoryView.contains(slot)) return;
      this.emitSurvivalSlotAction(slot, 'primary', event.shiftKey, event.detail >= 2);
    };
    this.survivalInventoryView.addEventListener('click', clickHandler);
    this.cleanups.push(() => this.survivalInventoryView.removeEventListener('click', clickHandler));

    const contextHandler = (event: MouseEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      const slot = target?.closest<HTMLButtonElement>('[data-inventory-area]');
      if (!slot || !this.survivalInventoryView.contains(slot)) return;
      event.preventDefault();
      this.emitSurvivalSlotAction(slot, 'secondary', event.shiftKey, false);
    };
    this.survivalInventoryView.addEventListener('contextmenu', contextHandler);
    this.cleanups.push(() => {
      this.survivalInventoryView.removeEventListener('contextmenu', contextHandler);
    });
  }

  private bindDeathScreen(): void {
    this.element.querySelectorAll<HTMLButtonElement>('[data-death-action]').forEach((button) => {
      const handler = (): void => {
        if (button.dataset.deathAction === 'respawn') {
          this.hideDeath();
          this.emit('respawn', undefined);
        } else if (button.dataset.deathAction === 'title') {
          this.hideDeath();
          this.emit('deathtitle', undefined);
        }
      };
      button.addEventListener('click', handler);
      this.cleanups.push(() => button.removeEventListener('click', handler));
    });
  }

  private bindSettings(): void {
    this.element
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-setting]')
      .forEach((control) => {
        const eventName =
          control instanceof HTMLInputElement && control.type === 'range'
            ? 'input'
            : 'change';
        const handler = (): void => {
          const key = control.dataset.setting as keyof GameUISettings | undefined;
          if (!key) return;

          let value: GameUISettings[keyof GameUISettings];
          switch (key) {
            case 'renderDistance':
            case 'fov':
            case 'sensitivity':
            case 'volume':
              value = Number(control.value);
              break;
            case 'showDebug':
              value = control instanceof HTMLInputElement && control.checked;
              break;
            case 'quality':
              value = control.value === 'fast' || control.value === 'fancy'
                ? control.value
                : 'balanced';
              break;
            case 'touchLayout':
              value = control.value === 'compact' ? 'compact' : 'classic';
              break;
          }

          this.settings = { ...this.settings, [key]: value };
          this.renderSettings();
          this.renderStatsVisibility();
          this.element.dataset.touchLayout = this.settings.touchLayout;
          this.emit('settingschange', {
            key,
            value,
            settings: this.getSettings()
          });
        };

        control.addEventListener(eventName, handler);
        this.cleanups.push(() => control.removeEventListener(eventName, handler));
      });
  }

  private bindTouchControls(): void {
    const movePad = this.require<HTMLElement>('[data-touch-move]');
    const lookZone = this.require<HTMLElement>('[data-touch-look]');
    let movePointer: number | null = null;
    let lookPointer: number | null = null;
    let lastLookX = 0;
    let lastLookY = 0;

    const updateMove = (event: PointerEvent): void => {
      const rect = movePad.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const maxRadius = Math.max(1, rect.width * 0.31);
      const rawX = event.clientX - centerX;
      const rawY = event.clientY - centerY;
      const magnitude = Math.hypot(rawX, rawY);
      const scale = magnitude > maxRadius ? maxRadius / magnitude : 1;
      const offsetX = rawX * scale;
      const offsetY = rawY * scale;

      this.moveKnob.style.transform =
        'translate(calc(-50% + ' + offsetX + 'px), calc(-50% + ' + offsetY + 'px))';
      this.emit('mobileaction', {
        action: 'move',
        x: offsetX / maxRadius,
        y: -offsetY / maxRadius,
        active: true
      });
    };

    const moveDown = (event: PointerEvent): void => {
      event.preventDefault();
      movePointer = event.pointerId;
      movePad.setPointerCapture(event.pointerId);
      movePad.classList.add('is-active');
      updateMove(event);
    };
    const moveMove = (event: PointerEvent): void => {
      if (movePointer === event.pointerId) updateMove(event);
    };
    const moveEnd = (event: PointerEvent): void => {
      if (movePointer !== event.pointerId) return;
      movePointer = null;
      movePad.classList.remove('is-active');
      this.moveKnob.style.transform = 'translate(-50%, -50%)';
      this.emit('mobileaction', { action: 'move', x: 0, y: 0, active: false });
    };

    movePad.addEventListener('pointerdown', moveDown);
    movePad.addEventListener('pointermove', moveMove);
    movePad.addEventListener('pointerup', moveEnd);
    movePad.addEventListener('pointercancel', moveEnd);
    this.cleanups.push(() => {
      movePad.removeEventListener('pointerdown', moveDown);
      movePad.removeEventListener('pointermove', moveMove);
      movePad.removeEventListener('pointerup', moveEnd);
      movePad.removeEventListener('pointercancel', moveEnd);
    });

    const lookDown = (event: PointerEvent): void => {
      event.preventDefault();
      lookPointer = event.pointerId;
      lastLookX = event.clientX;
      lastLookY = event.clientY;
      lookZone.setPointerCapture(event.pointerId);
    };
    const lookMove = (event: PointerEvent): void => {
      if (lookPointer !== event.pointerId) return;
      const dx = event.clientX - lastLookX;
      const dy = event.clientY - lastLookY;
      lastLookX = event.clientX;
      lastLookY = event.clientY;
      this.emit('mobileaction', { action: 'look', dx, dy, active: true });
    };
    const lookEnd = (event: PointerEvent): void => {
      if (lookPointer !== event.pointerId) return;
      lookPointer = null;
      this.emit('mobileaction', { action: 'look', dx: 0, dy: 0, active: false });
    };

    lookZone.addEventListener('pointerdown', lookDown);
    lookZone.addEventListener('pointermove', lookMove);
    lookZone.addEventListener('pointerup', lookEnd);
    lookZone.addEventListener('pointercancel', lookEnd);
    this.cleanups.push(() => {
      lookZone.removeEventListener('pointerdown', lookDown);
      lookZone.removeEventListener('pointermove', lookMove);
      lookZone.removeEventListener('pointerup', lookEnd);
      lookZone.removeEventListener('pointercancel', lookEnd);
    });

    this.element
      .querySelectorAll<HTMLButtonElement>('[data-mobile-action]')
      .forEach((button) => {
        const action = button.dataset.mobileAction;
        if (
          action !== 'jump' &&
          action !== 'crouch' &&
          action !== 'break' &&
          action !== 'place'
        ) {
          return;
        }
        let pressed = false;
        const down = (event: PointerEvent): void => {
          event.preventDefault();
          pressed = true;
          button.classList.add('is-active');
          button.setPointerCapture(event.pointerId);
          this.emit('mobileaction', { action, pressed: true });
        };
        const up = (): void => {
          if (!pressed) return;
          pressed = false;
          button.classList.remove('is-active');
          this.emit('mobileaction', { action, pressed: false });
        };
        button.addEventListener('pointerdown', down);
        button.addEventListener('pointerup', up);
        button.addEventListener('pointercancel', up);
        this.cleanups.push(() => {
          button.removeEventListener('pointerdown', down);
          button.removeEventListener('pointerup', up);
          button.removeEventListener('pointercancel', up);
        });
      });

    const inventoryButton = this.require<HTMLButtonElement>('[data-touch-inventory]');
    const inventoryHandler = (): void => {
      this.toggleInventory();
    };
    inventoryButton.addEventListener('click', inventoryHandler);
    this.cleanups.push(() => inventoryButton.removeEventListener('click', inventoryHandler));

    const pauseButton = this.require<HTMLButtonElement>('[data-touch-pause]');
    const pauseHandler = (): void => {
      this.emit('mobileaction', { action: 'pause', pressed: true });
      this.showPause(true);
    };
    pauseButton.addEventListener('click', pauseHandler);
    this.cleanups.push(() => pauseButton.removeEventListener('click', pauseHandler));
  }

  private renderHotbar(): void {
    this.hotbar.replaceChildren();
    const fragment = document.createDocumentFragment();

    for (let index = 0; index < 9; index += 1) {
      const stack = this.inventoryMode === 'survival'
        ? this.survivalInventory.hotbar[index] ?? null
        : null;
      const block = stack?.block ??
        (typeof stack?.itemId === 'number' ? stack.itemId : undefined) ??
        this.hotbarBlocks[index] ??
        BlockId.Grass;
      const presentation = getBlockPresentation(block);
      const label = stack
        ? getItemLabel(stack)
        : this.inventoryMode === 'survival'
          ? '空'
          : presentation.label;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hotbar-slot';
      button.dataset.slot = String(index);
      button.setAttribute(
        'aria-label',
        (index + 1) + '号快捷栏：' + label + (stack ? '，' + stack.count + '个' : '')
      );
      button.setAttribute('aria-current', index === this.selectedSlot ? 'true' : 'false');
      button.classList.toggle('is-selected', index === this.selectedSlot);

      const number = document.createElement('span');
      number.className = 'hotbar-number';
      number.textContent = String(index + 1);
      button.append(number);
      if (stack) appendItemStack(button, stack);
      else if (this.inventoryMode === 'creative') button.append(createBlockSwatch(presentation));
      fragment.append(button);
    }

    this.hotbar.append(fragment);
  }

  private renderInventory(): void {
    const query = this.inventorySearch.value.trim().toLocaleLowerCase('zh-CN');
    const visibleBlocks = BLOCKS.filter((block) => {
      const categoryMatch =
        this.inventoryCategory === 'all' || block.category === this.inventoryCategory;
      const queryMatch =
        query.length === 0 ||
        block.label.toLocaleLowerCase('zh-CN').includes(query) ||
        block.name.includes(query);
      return categoryMatch && queryMatch;
    });

    this.inventoryGrid.replaceChildren();
    const fragment = document.createDocumentFragment();
    visibleBlocks.forEach((block) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'inventory-slot';
      button.dataset.blockId = String(block.id);
      button.setAttribute('role', 'gridcell');
      button.setAttribute('aria-label', block.label);
      button.title = block.label;
      button.append(createBlockSwatch(block));
      fragment.append(button);
    });

    this.inventoryGrid.append(fragment);
    this.require<HTMLElement>('[data-inventory-empty]').hidden = visibleBlocks.length > 0;
  }

  private renderSurvivalInventory(): void {
    this.renderSlotGrid(
      this.survivalMainGrid,
      this.survivalInventory.main,
      'main',
      27
    );
    this.renderSlotGrid(
      this.survivalHotbarGrid,
      this.survivalInventory.hotbar,
      'hotbar',
      9
    );
    this.renderSlotGrid(
      this.survivalArmor,
      this.survivalInventory.armor ?? [],
      'armor',
      4,
      ['头', '胸', '腿', '靴']
    );
    this.renderSlotGrid(
      this.survivalOffhand,
      [this.survivalInventory.offhand ?? null],
      'offhand',
      1,
      ['副']
    );
    this.renderCraftingSlots();
    this.renderChestInventory();
    this.renderFurnaceInventory();

    this.cursorStack.replaceChildren();
    const cursor = this.survivalInventory.cursor ?? null;
    this.cursorStack.hidden = cursor === null;
    if (cursor) {
      appendItemStack(this.cursorStack, cursor);
      this.cursorStack.setAttribute('aria-label', '手持：' + getItemLabel(cursor));
    }
  }

  private renderCraftingSlots(): void {
    const slotCount = this.craftingGridSize * this.craftingGridSize;
    this.survivalInventoryView.dataset.craftingContext = this.craftingContext;
    this.survivalInventoryView.dataset.craftingSize = String(this.craftingGridSize);
    this.require<HTMLElement>('[data-crafting-title]').textContent =
      this.craftingContext === 'table' ? '工作台' : '合成';
    this.craftingGrid.setAttribute(
      'aria-label',
      this.craftingGridSize + '乘' + this.craftingGridSize + '合成格'
    );
    this.renderSlotGrid(
      this.craftingGrid,
      this.survivalInventory.crafting,
      'crafting',
      slotCount
    );
    this.renderSlotGrid(
      this.craftingOutput,
      [this.survivalInventory.craftOutput],
      'craft-output',
      1,
      ['成']
    );
    this.craftingOutput
      .querySelector<HTMLButtonElement>('.survival-slot')
      ?.classList.add('crafting-result-slot');
  }

  private renderChestInventory(): void {
    const { size, title } = this.chestInventory;
    this.survivalInventoryView.dataset.chestSize = String(size);
    this.chestTitle.textContent = title;
    this.chestGrid.setAttribute('aria-label', title + '物品');
    if (this.containerContext === 'chest') {
      this.require<HTMLElement>('[data-inventory-title]').textContent = title;
    }
    this.renderSlotGrid(
      this.chestGrid,
      this.chestInventory.slots,
      'chest',
      size
    );
  }

  private renderFurnaceInventory(): void {
    this.renderSlotGrid(
      this.furnaceInput,
      [this.furnaceInventory.input],
      'furnace-input',
      1,
      ['入']
    );
    this.renderSlotGrid(
      this.furnaceFuel,
      [this.furnaceInventory.fuel],
      'furnace-fuel',
      1,
      ['燃']
    );
    this.renderSlotGrid(
      this.furnaceOutput,
      [this.furnaceInventory.output],
      'furnace-output',
      1,
      ['出']
    );
    this.furnaceOutput
      .querySelector<HTMLButtonElement>('.survival-slot')
      ?.classList.add('crafting-result-slot');
    this.renderFurnaceProgress();
  }

  private renderFurnaceProgress(): void {
    this.furnaceBurn.style.height = this.furnaceInventory.burnProgress * 100 + '%';
    this.furnaceCook.style.width = this.furnaceInventory.cookProgress * 100 + '%';
    this.furnacePanel.classList.toggle('is-burning', this.furnaceInventory.burning);
  }

  private renderSlotGrid(
    container: HTMLElement,
    stacks: readonly (InventoryItemStack | null)[],
    area: InventoryArea,
    count: number,
    hints: readonly string[] = []
  ): void {
    container.replaceChildren();
    const fragment = document.createDocumentFragment();

    for (let index = 0; index < count; index += 1) {
      const stack = stacks[index] ?? null;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'survival-slot';
      button.classList.toggle('has-item', stack !== null);
      button.dataset.inventoryArea = area;
      button.dataset.inventoryIndex = String(index);
      const hint = hints[index];
      if (hint) button.dataset.slotHint = hint;
      button.setAttribute('role', 'gridcell');
      button.setAttribute(
        'aria-label',
        stack
          ? getItemLabel(stack) + '，' + stack.count + '个'
          : getEmptySlotLabel(area, index)
      );
      button.title = stack ? getItemLabel(stack) : getEmptySlotLabel(area, index);
      if (stack) appendItemStack(button, stack);
      fragment.append(button);
    }
    container.append(fragment);
  }

  private renderRecipes(): void {
    const query = this.recipeSearch.value.trim().toLocaleLowerCase('zh-CN');
    const visible = this.recipes.filter((recipe) => {
      const label = recipe.label ?? getItemLabel(recipe.output);
      return query.length === 0 ||
        label.toLocaleLowerCase('zh-CN').includes(query) ||
        recipe.id.toLocaleLowerCase().includes(query);
    });

    this.recipeList.replaceChildren();
    const fragment = document.createDocumentFragment();
    visible.forEach((recipe) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'recipe-entry';
      button.dataset.recipeId = recipe.id;
      button.classList.toggle('is-locked', recipe.unlocked === false);
      button.classList.toggle('is-craftable', recipe.craftable !== false);
      button.disabled = recipe.unlocked === false;
      button.setAttribute(
        'aria-label',
        (recipe.label ?? getItemLabel(recipe.output)) +
          (recipe.craftable === false ? '，材料不足' : '，可以制作')
      );
      button.append(createItemVisual(recipe.output, 'recipe-entry__icon'));

      const copy = document.createElement('span');
      copy.className = 'recipe-entry__copy';
      const name = document.createElement('b');
      name.textContent = recipe.label ?? getItemLabel(recipe.output);
      const ingredients = document.createElement('small');
      ingredients.textContent = recipe.ingredients
        .map((ingredient) => {
          return (ingredient.label ?? getItemLabelById(ingredient.itemId)) +
            ' ×' + ingredient.count;
        })
        .join(' · ');
      copy.append(name, ingredients);

      const count = document.createElement('span');
      count.className = 'recipe-entry__count';
      count.textContent = '×' + recipe.output.count;
      button.append(copy, count);
      fragment.append(button);
    });
    this.recipeList.append(fragment);
    this.require<HTMLElement>('[data-recipe-empty]').hidden = visible.length > 0;
  }

  private syncInventoryMode(): void {
    const creative = this.inventoryMode === 'creative' && this.containerContext === 'player';
    const furnace = this.containerContext === 'furnace';
    const chest = this.containerContext === 'chest';
    this.creativeInventoryView.hidden = !creative;
    this.creativeInventoryView.inert = !creative;
    this.survivalInventoryView.hidden = creative;
    this.survivalInventoryView.inert = creative;
    this.require<HTMLElement>('[data-inventory-kicker]').textContent =
      creative
        ? 'CREATIVE INVENTORY'
        : furnace
          ? 'FURNACE'
          : chest
            ? 'CHEST'
            : 'SURVIVAL INVENTORY';
    this.require<HTMLElement>('[data-inventory-title]').textContent =
      creative
        ? '创造物品栏'
        : furnace
          ? '熔炉'
          : chest
            ? this.chestInventory.title
            : '生存与合成';
    this.element.querySelectorAll<HTMLButtonElement>('[data-inventory-mode]').forEach((button) => {
      button.setAttribute(
        'aria-selected',
        String(button.dataset.inventoryMode === this.inventoryMode)
      );
    });
    if (creative || furnace || chest) this.setRecipeBookOpen(false);
  }

  private emitSurvivalSlotAction(
    slot: HTMLButtonElement,
    button: 'primary' | 'secondary',
    shiftKey: boolean,
    doubleClick: boolean
  ): void {
    const area = slot.dataset.inventoryArea;
    const index = Number.parseInt(slot.dataset.inventoryIndex ?? '0', 10);
    if (!isInventoryArea(area) || !Number.isFinite(index)) return;
    const stack = this.getStackForArea(area, index);
    this.emit('inventoryslotaction', {
      area,
      index,
      button,
      shiftKey,
      doubleClick,
      stack: cloneItemStack(stack)
    });
    if (!doubleClick && area === 'craft-output' && stack && shiftKey) {
      this.emit('craftrequest', {
        source: 'output',
        amount: 'max'
      });
    }
  }

  private getStackForArea(area: InventoryArea, index: number): InventoryItemStack | null {
    switch (area) {
      case 'main':
        return this.survivalInventory.main[index] ?? null;
      case 'hotbar':
        return this.survivalInventory.hotbar[index] ?? null;
      case 'chest':
        return this.chestInventory.slots[index] ?? null;
      case 'crafting':
        return this.survivalInventory.crafting[index] ?? null;
      case 'craft-output':
        return this.survivalInventory.craftOutput;
      case 'furnace-input':
        return this.furnaceInventory.input;
      case 'furnace-fuel':
        return this.furnaceInventory.fuel;
      case 'furnace-output':
        return this.furnaceInventory.output;
      case 'armor':
        return this.survivalInventory.armor?.[index] ?? null;
      case 'offhand':
        return this.survivalInventory.offhand ?? null;
    }
  }

  private syncInventoryTabs(): void {
    this.element
      .querySelectorAll<HTMLButtonElement>('[data-inventory-category]')
      .forEach((button) => {
        const selected = button.dataset.inventoryCategory === this.inventoryCategory;
        button.setAttribute('aria-selected', String(selected));
      });
  }

  private renderSettings(): void {
    const setValue = (key: keyof GameUISettings, value: string): void => {
      const control = this.element.querySelector<HTMLInputElement | HTMLSelectElement>(
        '[data-setting="' + key + '"]'
      );
      if (control) control.value = value;
    };

    setValue('renderDistance', String(this.settings.renderDistance));
    setValue('fov', String(this.settings.fov));
    setValue('sensitivity', String(this.settings.sensitivity));
    setValue('volume', String(this.settings.volume));
    setValue('quality', this.settings.quality);
    setValue('touchLayout', this.settings.touchLayout);

    const debugToggle = this.element.querySelector<HTMLInputElement>(
      '[data-setting="showDebug"]'
    );
    if (debugToggle) debugToggle.checked = this.settings.showDebug;

    this.setSettingOutput('renderDistance', this.settings.renderDistance + ' 区块');
    this.setSettingOutput('fov', this.settings.fov + '°');
    this.setSettingOutput('sensitivity', this.settings.sensitivity.toFixed(1) + '×');
    this.setSettingOutput('volume', this.settings.volume + '%');
  }

  private setSettingOutput(key: keyof GameUISettings, value: string): void {
    const output = this.element.querySelector<HTMLOutputElement>(
      '[data-setting-output="' + key + '"]'
    );
    if (output) output.textContent = value;
  }

  private renderStatsVisibility(): void {
    this.debugReadout.hidden = !(this.statsAvailable && this.settings.showDebug);
  }

  private renderVitals(): void {
    const health = this.require<HTMLElement>('[data-health-row]');
    const hunger = this.require<HTMLElement>('[data-hunger-row]');
    const armor = this.require<HTMLElement>('[data-armor-row]');
    const air = this.require<HTMLElement>('[data-air-row]');
    const healthFragment = document.createDocumentFragment();
    const hungerFragment = document.createDocumentFragment();
    const armorFragment = document.createDocumentFragment();
    const airFragment = document.createDocumentFragment();

    for (let index = 0; index < 10; index += 1) {
      healthFragment.append(createVitalIcon('heart'));
      hungerFragment.append(createVitalIcon('hunger'));
      armorFragment.append(createVitalIcon('armor'));
      airFragment.append(createVitalIcon('air'));
    }
    health.append(healthFragment);
    hunger.append(hungerFragment);
    armor.append(armorFragment);
    air.append(airFragment);
    this.setVitals({ health: 20, hunger: 20, armor: 0, experience: 0.28, level: 1 });
    this.setAir(20, 20, false);
  }

  private updateVitalIcons(selector: string, value: number): void {
    const icons = this.element.querySelectorAll<HTMLElement>(selector);
    const normalized = Math.min(20, Math.max(0, value));
    icons.forEach((icon, index) => {
      const amount = normalized - index * 2;
      icon.classList.toggle('is-empty', amount <= 0);
      icon.classList.toggle('is-half', amount > 0 && amount < 2);
    });
  }

  private updateModalState(): void {
    const modalOpen =
      this.inventoryOpen ||
      this.activeMenu !== null ||
      !this.loadingScreen.hidden ||
      this.deathVisible;
    this.element.classList.toggle('has-modal', modalOpen);
  }
}

function getBlockPresentation(block: BlockId): BlockPresentation {
  return BLOCKS.find((presentation) => presentation.id === block) ?? BLOCKS[0]!;
}

function createBlockSwatch(block: BlockPresentation): HTMLSpanElement {
  const swatch = document.createElement('span');
  swatch.className = 'block-swatch ' + block.cssClass;
  swatch.setAttribute('aria-hidden', 'true');
  return swatch;
}

function createVitalIcon(type: 'heart' | 'hunger' | 'armor' | 'air'): HTMLSpanElement {
  const icon = document.createElement('span');
  icon.className = 'vital-icon vital-icon--' + type;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function createDefaultSurvivalInventory(): SurvivalInventoryState {
  return {
    main: Array.from({ length: 27 }, () => null),
    hotbar: HOTBAR_BLOCKS.map((block) => createBlockStack(block, 64)),
    crafting: Array.from({ length: 4 }, () => null),
    craftOutput: null,
    armor: Array.from({ length: 4 }, () => null),
    offhand: null,
    cursor: null
  };
}

function createDefaultChestInventory(): NormalizedChestInventoryState {
  return normalizeChestInventoryState({ slots: [] });
}

function createDefaultFurnaceInventory(): FurnaceInventoryState {
  return {
    input: null,
    fuel: null,
    output: null,
    burnProgress: 0,
    cookProgress: 0,
    burning: false
  };
}

function normalizeProgress(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function createBlockStack(block: BlockId, count: number): InventoryItemStack {
  return {
    itemId: block,
    block,
    label: CHINESE_BLOCK_LABELS[block] ?? getBlockPresentation(block).label,
    count,
    maxCount: 64,
    icon: 'block'
  };
}

function cloneItemStack(stack: InventoryItemStack | null | undefined): InventoryItemStack | null {
  if (!stack) return null;
  return {
    ...stack,
    count: Math.max(0, Math.trunc(stack.count)),
    durability: stack.durability ? { ...stack.durability } : undefined
  };
}

function normalizeStacks(
  stacks: readonly (InventoryItemStack | null)[],
  count: number
): (InventoryItemStack | null)[] {
  return Array.from({ length: count }, (_, index) => cloneItemStack(stacks[index]));
}

export function normalizeChestInventoryState(
  state: ChestInventoryState
): NormalizedChestInventoryState {
  const requestedSize = state.size;
  const size: ChestInventorySize = requestedSize === 54
    ? 54
    : requestedSize === 27
      ? 27
      : state.slots.length > 27
        ? 54
        : 27;
  const providedTitle = typeof state.title === 'string' ? state.title.trim() : '';
  return {
    slots: normalizeStacks(state.slots, size),
    size,
    title: providedTitle || (size === 54 ? '大箱子' : '箱子')
  };
}

function cloneSurvivalInventory(
  state: SurvivalInventoryState,
  craftingSlotCount = 4
): SurvivalInventoryState {
  return {
    main: normalizeStacks(state.main, 27),
    hotbar: normalizeStacks(state.hotbar, 9),
    crafting: normalizeStacks(state.crafting, craftingSlotCount),
    craftOutput: cloneItemStack(state.craftOutput),
    armor: normalizeStacks(state.armor ?? [], 4),
    offhand: cloneItemStack(state.offhand ?? null),
    cursor: cloneItemStack(state.cursor ?? null)
  };
}

function cloneRecipe(recipe: CraftingRecipe): CraftingRecipe {
  return {
    ...recipe,
    output: cloneItemStack(recipe.output)!,
    ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient })),
    pattern: recipe.pattern ? [...recipe.pattern] : undefined
  };
}

function appendItemStack(container: HTMLElement, stack: InventoryItemStack): void {
  container.append(createItemVisual(stack, 'item-stack__visual'));
  if (stack.count > 1) {
    const count = document.createElement('span');
    count.className = 'item-count';
    count.textContent = String(Math.min(999, Math.max(0, Math.trunc(stack.count))));
    container.append(count);
  }
  if (stack.durability && stack.durability.max > 0) {
    const ratio = Math.min(1, Math.max(0, stack.durability.current / stack.durability.max));
    const durability = document.createElement('span');
    durability.className = 'item-durability';
    durability.dataset.level = ratio <= 0.15 ? 'critical' : ratio <= 0.35 ? 'low' : 'normal';
    const fill = document.createElement('i');
    fill.style.width = ratio * 100 + '%';
    durability.append(fill);
    container.append(durability);
  }
}

function createItemVisual(stack: InventoryItemStack, extraClass = ''): HTMLElement {
  const block = stack.block ?? (typeof stack.itemId === 'number' ? stack.itemId : undefined);
  if (block !== undefined && block !== BlockId.Air) {
    const swatch = createBlockSwatch(getBlockPresentation(block));
    swatch.classList.add('item-visual');
    if (extraClass) swatch.classList.add(extraClass);
    return swatch;
  }

  const icon = document.createElement('span');
  const itemKey = getItemKey(stack.itemId);
  icon.className =
    'item-visual item-icon item-icon--' + inferItemIcon(stack) + ' item-' + itemKey;
  if (extraClass) icon.classList.add(extraClass);
  if (stack.tint) icon.style.setProperty('--item-tint', stack.tint);
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function inferItemIcon(stack: InventoryItemStack): InventoryItemIcon {
  if (stack.icon && stack.icon !== 'block') return stack.icon;
  const id = typeof stack.itemId === 'string' ? stack.itemId.toLowerCase() : '';
  if (id.endsWith('_pickaxe')) return 'pickaxe';
  if (id.endsWith('_axe')) return 'axe';
  if (id.endsWith('_shovel')) return 'shovel';
  if (id.endsWith('_sword')) return 'sword';
  if (id.includes('pork') || id.includes('mutton') || id.includes('beef') || id === 'rotten_flesh') return 'food';
  if (id.includes('bucket')) return 'bucket';
  if (
    id === 'coal' ||
    id === 'raw_iron' ||
    id === 'iron_ingot' ||
    id === 'diamond' ||
    id === 'stick' ||
    id === 'wool' ||
    id === 'leather'
  ) {
    return 'material';
  }
  return stack.icon ?? 'generic';
}

function getItemLabel(stack: InventoryItemStack): string {
  const provided = stack.label?.trim();
  if (provided) return provided;
  if (stack.block !== undefined) return CHINESE_BLOCK_LABELS[stack.block];
  return getItemLabelById(stack.itemId);
}

function getItemLabelById(itemId: string | BlockId): string {
  if (typeof itemId === 'number') {
    return CHINESE_BLOCK_LABELS[itemId] ?? getBlockPresentation(itemId).label;
  }
  return ITEM_LABELS[itemId] ?? itemId.replaceAll('_', ' ');
}

function getItemKey(itemId: string | BlockId): string {
  return String(itemId)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'generic';
}

function getEmptySlotLabel(area: InventoryArea, index: number): string {
  switch (area) {
    case 'main':
      return '空背包槽位 ' + (index + 1);
    case 'hotbar':
      return '空快捷栏槽位 ' + (index + 1);
    case 'chest':
      return '空箱子槽位 ' + (index + 1);
    case 'crafting':
      return '空合成槽位 ' + (index + 1);
    case 'craft-output':
      return '合成输出';
    case 'furnace-input':
      return '熔炼输入槽';
    case 'furnace-fuel':
      return '燃料槽';
    case 'furnace-output':
      return '熔炼输出槽';
    case 'armor':
      return ['头盔槽', '胸甲槽', '护腿槽', '靴子槽'][index] ?? '装备槽';
    case 'offhand':
      return '副手槽';
  }
}

function isInventoryArea(value: string | undefined): value is InventoryArea {
  return value === 'main' ||
    value === 'hotbar' ||
    value === 'chest' ||
    value === 'crafting' ||
    value === 'craft-output' ||
    value === 'furnace-input' ||
    value === 'furnace-fuel' ||
    value === 'furnace-output' ||
    value === 'armor' ||
    value === 'offhand';
}
