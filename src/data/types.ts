// 데이터 정의 타입. JSON 테이블과 1:1 대응하며, Unity 이식 시 ScriptableObject/[Serializable] class로 옮긴다.

export type FishBehavior = 'wander' | 'skittish' | 'aggressive' | 'charger';
export type FishShape = 'fish' | 'eel' | 'shark' | 'round' | 'squid' | 'angler';

export interface FishDef {
  id: string;
  name: string;
  depthMin: number;
  depthMax: number;
  hp: number;
  speed: number;
  radius: number;
  color: string;
  finColor: string;
  value: number;
  weight: number;
  behavior: FishBehavior;
  damage: number;
  rarity: number;
  schoolMin: number;
  schoolMax: number;
  shape: FishShape;
  pattern?: 'stripes';
  spiky?: boolean;
  glow?: boolean;
}

export type ItemShape = 'seaweed' | 'shell' | 'urchin' | 'abalone' | 'cucumber' | 'pearl' | 'ore';

export interface ItemDef {
  id: string;
  name: string;
  depthMin: number;
  depthMax: number;
  value: number;
  weight: number;
  color: string;
  shape: ItemShape;
  rarity: number;
  harvestTime: number;
}

export type WeaponType = 'projectile' | 'melee' | 'net';

export interface WeaponDef {
  id: string;
  name: string;
  description: string;
  type: WeaponType;
  cost: number;
  damage: number;
  /** 다음 공격까지 대기 시간(초) */
  reload: number;
  rangeM: number;
  /** 탄약 수. -1이면 무제한 */
  ammo: number;
  speed?: number;
  projectiles?: number;
  spread?: number;
  /** 근접 공격 판정 각도(라디안, 전체 폭) */
  arc?: number;
  /** 그물이 펼쳐지는 반경(px) */
  netRadius?: number;
  /** 현재 HP가 이 값 이하인 생물만 포획 */
  captureHp?: number;
  stun?: number;
  chainRadius?: number;
  chainCount?: number;
}

export type StatId = 'maxOxygen' | 'cargoCapacity' | 'depthLimit' | 'swimSpeed' | 'damageMultiplier';

export interface UpgradeLevel {
  cost: number;
  value: number;
}

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  stat: StatId;
  unit: string;
  levels: UpgradeLevel[];
}

export interface ZoneDef {
  id: string;
  name: string;
  depthMin: number;
  depthMax: number;
  /** 기본 산소 소모량에 곱해지는 배율. 구간 사이에서는 보간된다. */
  oxygenMultiplier: number;
  water: string;
  rock: string;
}

export interface ModifierDef {
  id: string;
  name: string;
  description: string;
  weight: number;
  currentForce?: number;
  darknessBonus?: number;
  lightScale?: number;
  resourceMultiplier?: number;
  fishMultiplier?: number;
  aggressiveWeight?: number;
  eliteMultiplier?: number;
  valueMultiplier?: number;
}

export interface BalanceDef {
  pxPerMeter: number;
  worldDepthM: number;
  shaftHalfWidthTop: number;
  shaftHalfWidthBottom: number;
  wallNoiseAmp: number;
  floorNoiseAmp: number;
  boatX: number;
  /** 이 수심(m)보다 얕으면 E로 배에 돌아갈 수 있다 */
  surfaceReturnDepthM: number;
  /** 귀환 연출(떠오르며 암전) 길이(초) */
  returnFadeTime: number;
  returnFloatSpeed: number;
  oxygenDrainPerSec: number;
  boostDrainPerSec: number;
  overDepthDrainPerSec: number;
  boostMultiplier: number;
  pickupMagnetRadius: number;
  bandHeightM: number;
  schoolsPerBand: number;
  resourceSpacingMin: number;
  resourceSpacingMax: number;
  resourceChance: number;
  cratesPerDive: number;
  crateOxygenBase: number;
  crateOxygenPer100m: number;
  oxygenStationCount: number;
  oxygenStationAmount: number;
  /** 산소 스테이션 재사용 대기(초) */
  oxygenStationCooldown: number;
  warpCount: number;
  eliteChanceAtBottom: number;
  invulnTime: number;
  startMoney: number;
}

export interface SpriteDef {
  id: string;
  file: string;
  /** 생성 기준 해상도 */
  width: number;
  height: number;
  prompt: string;
}

export interface SpriteManifest {
  basePath: string;
  /** 모든 스프라이트 공통 화풍 프롬프트 */
  style: string;
  /** fish_* 에 추가로 붙는 프롬프트 */
  creatureStyle: string;
  /** item_*, weapon_*, proj_*, boat, crate 에 추가로 붙는 프롬프트 */
  objectStyle: string;
  sprites: SpriteDef[];
}
