export type Limb = 'lh' | 'rh' | 'lf' | 'rf';
export type Hand = 'lh' | 'rh';
export type Contacts = Record<Limb, string>;
export type HoldKind = 'jug' | 'edge' | 'slope' | 'step';

export interface Point {
  x: number;
  y: number;
}

export interface Hold extends Point {
  id: string;
  kind: HoldKind;
  angle: number;
  /** 宽点仅允许从哪一侧接近：-1 左、1 右；缺省为两侧开放 */
  openSide?: -1 | 1;
}

export interface Route {
  id: string;
  name: string;
  grade: string;
  color: string;
  tilt: number;
  energy: number;
  start: Contacts;
  finish: string;
  holds: Hold[];
}

export interface Move {
  limb: Limb;
  target: string;
}

export interface Balance {
  margin: number;
  span: number;
}

export type Failure = 'reach' | 'support' | 'energy' | 'grip-side' | 'grip-overlap' | 'grip-clamp';

/** 岩点在本地轮廓坐标系（x 沿握持边、y 沿深度）内的原子握持分区 */
export interface GripZone {
  id: string;
  /** 分区中心（本地坐标，x 沿岩点长边，单位约等于像素） */
  x: number;
  /** 分区在握持边上的覆盖半宽 */
  half: number;
  /** 允许接近的一侧：-1 仅左侧，1 仅右侧，0 任意侧 */
  approach: -1 | 0 | 1;
  /** 对捏发力向量（本地坐标），并握时两手向量必须相反 */
  force: Point;
}

/** 一只手在宽点上的实际握位：覆盖的分区 + 占该点握持面积的比例 */
export interface HandGrip {
  zones: string[];
  fraction: number;
  /** 该手在本地坐标系中的实际落指中心 */
  center: Point;
  /** 实际对捏发力方向（单位向量，本地坐标） */
  force: Point;
}

/** 并握方案中的一帧连续分配（旧手逐步释放、新手逐步落指） */
export interface GripFrame {
  index: number;
  /** 旧手仍覆盖的握持面积比例 */
  oldFraction: number;
  /** 新手已覆盖的握持面积比例 */
  newFraction: number;
  /** 当前帧的支撑余量 */
  margin: number;
  /** 累计已经让出的握持面积比例 */
  released: number;
}

/** 同点并握 / 挤压换手方案 */
export interface SharedGripPlan {
  mode: 'match' | 'squeeze';
  holdId: string;
  oldHand: Hand;
  newHand: Hand;
  /** 新手最终实际握位 */
  incoming: HandGrip;
  /** 旧手保留的实际握位 */
  resident: HandGrip;
  /** 从原握法到新握法的连续分配帧 */
  frames: GripFrame[];
  /** 旧手在不使剩余支撑跌破零的前提下最多可释放的面积比例 */
  releaseLimit: number;
  /** 完成换手所需释放的最小面积比例 */
  releaseNeeded: number;
  /** 两手是否只能从同一侧接近（结构性拒绝） */
  sameSideApproach: boolean;
  /** 真正发生手指覆盖重叠的分区 id（回看用） */
  overlapZones: string[];
  /** 失去对捏夹持（发力方向未相反）的分区 id（回看用） */
  unclampedZones: string[];
}

/** 各宽点上的双手实际握位，key 为岩点 id */
export type GripState = Record<string, { lh?: HandGrip; rh?: HandGrip }>;

export interface Preview {
  move: Move;
  next: Contacts;
  cost: number;
  distance: number;
  reach: number;
  support: Balance;
  landing: Balance;
  failure: Failure | null;
  /** 同点并握 / 挤压换手方案（仅目标为已占用宽把手点时存在） */
  shared?: SharedGripPlan;
}

export interface MoveRecord extends Preview {
  before: Contacts;
  energyBefore: number;
  energyAfter: number;
  /** 该步之前的握持分配（回看用） */
  beforeGrips?: GripState;
}

export interface Attempt {
  id: string;
  routeId: string;
  result: 'success' | 'fall';
  moves: MoveRecord[];
  at: number;
}
