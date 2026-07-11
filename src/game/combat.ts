import {
  TOOL_DEFINITIONS,
  isToolItemId,
  type ItemStack,
  type ToolDefinition
} from './survival';

export interface AttackTiming {
  attackSpeed: number;
  fullChargeSeconds: number;
}

export interface ChargedAttackResult extends AttackTiming {
  strength: number;
  damageMultiplier: number;
  damage: number;
}

const EMPTY_HAND_ATTACK_SPEED = 4;

export function getAttackSpeed(heldStack: ItemStack | null | undefined): number {
  if (!heldStack || !isToolItemId(heldStack.item)) return EMPTY_HAND_ATTACK_SPEED;
  return getToolAttackSpeed(TOOL_DEFINITIONS[heldStack.item]);
}

export function getFullChargeSeconds(heldStack: ItemStack | null | undefined): number {
  return 1 / getAttackSpeed(heldStack);
}

export function getAttackTiming(heldStack: ItemStack | null | undefined): AttackTiming {
  const attackSpeed = getAttackSpeed(heldStack);
  return {
    attackSpeed,
    fullChargeSeconds: 1 / attackSpeed
  };
}

export function getAttackStrength(
  elapsedSinceLastAttackSeconds: number,
  heldStack: ItemStack | null | undefined
): number {
  if (!Number.isFinite(elapsedSinceLastAttackSeconds) || elapsedSinceLastAttackSeconds <= 0) {
    return 0;
  }
  return clampStrength(elapsedSinceLastAttackSeconds / getFullChargeSeconds(heldStack));
}

export function getAttackDamageMultiplier(strength: number): number {
  const normalizedStrength = clampStrength(strength);
  return 0.2 + normalizedStrength * normalizedStrength * 0.8;
}

export function getChargedAttackDamage(baseDamage: number, strength: number): number {
  const normalizedDamage = Number.isFinite(baseDamage) ? Math.max(0, baseDamage) : 0;
  return normalizedDamage * getAttackDamageMultiplier(strength);
}

export function calculateChargedAttack(
  baseDamage: number,
  elapsedSinceLastAttackSeconds: number,
  heldStack: ItemStack | null | undefined
): ChargedAttackResult {
  const timing = getAttackTiming(heldStack);
  const strength = getAttackStrength(elapsedSinceLastAttackSeconds, heldStack);
  const damageMultiplier = getAttackDamageMultiplier(strength);
  const normalizedDamage = Number.isFinite(baseDamage) ? Math.max(0, baseDamage) : 0;
  return {
    ...timing,
    strength,
    damageMultiplier,
    damage: normalizedDamage * damageMultiplier
  };
}

function getToolAttackSpeed(definition: ToolDefinition): number {
  if (definition.kind === 'sword') return 1.6;
  if (definition.kind === 'pickaxe') return 1.2;
  if (definition.kind === 'shovel') return 1;
  if (definition.kind === 'axe') {
    if (definition.tier === 'diamond') return 1;
    return definition.tier === 'iron' ? 0.9 : 0.8;
  }
  return EMPTY_HAND_ATTACK_SPEED;
}

function clampStrength(strength: number): number {
  if (!Number.isFinite(strength)) return 0;
  return Math.min(1, Math.max(0, strength));
}
