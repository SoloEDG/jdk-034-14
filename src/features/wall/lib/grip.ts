import type { GripZone, Hand, HandGrip, Hold, Point, SharedGripPlan, GripFrame } from '../../../shared/types';

/**
 * 宽把手点（jug）的可握持轮廓。
 * 本地坐标系：x 沿握持边方向（随 hold.angle 旋转），y 沿岩点深度。
 * 岩点被切成若干原子分区，每只手覆盖其中连续的一段，双手覆盖不得重叠。
 */
const ZONE_WIDTH = 9;
const ZONE_COUNT = 5;
/** 单手握持需要的分区数（至少 2 个分区才构成有轮廓的握位） */
const HAND_ZONES = 2;
/** 对捏成立的发力方向阈值：两手发力点积 ≤ 此值（夹角 ≥ 120°） */
const CLAMP_DOT = -0.5;
/** 连续分配的面积步长 */
const FRAME_STEP = 1 / ZONE_COUNT;

export function isWideJug(hold: Hold) {
  return hold.kind === 'jug';
}

/** 宽点的原子握持分区（本地坐标） */
export function gripZones(hold: Hold): GripZone[] {
  if (!isWideJug(hold)) return [];
  const zones: GripZone[] = [];
  for (let i = 0; i < ZONE_COUNT; i += 1) {
    const x = (i - (ZONE_COUNT - 1) / 2) * ZONE_WIDTH;
    const edge = i - (ZONE_COUNT - 1) / 2;
    zones.push({
      id: `${hold.id}:z${i + 1}`,
      x,
      half: ZONE_WIDTH / 2,
      // 外侧分区只能从对应侧接近，中央分区两侧皆可
      approach: edge < -0.5 ? -1 : edge > 0.5 ? 1 : 0,
      // 对捏发力：两侧分区方向相反（向中央夹持），中央分区沿深度方向
      force: edge < -0.5 ? { x: 1, y: 0 }
        : edge > 0.5 ? { x: -1, y: 0 }
          : { x: 0, y: -1 },
    });
  }
  return zones;
}

function unit(v: Point): Point {
  const n = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / n, y: v.y / n };
}

function rotate(local: Point, angleDeg: number): Point {
  const a = (angleDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: local.x * c - local.y * s, y: local.x * s + local.y * c };
}

/** 分区在岩壁坐标系中的中心 */
export function zonePoint(hold: Hold, zone: GripZone): Point {
  const local = rotate({ x: zone.x, y: 2 }, hold.angle);
  return { x: hold.x + local.x, y: hold.y + local.y };
}

/** 手的习惯接近侧：lh 从左（-1），rh 从右（+1） */
export function handApproachSide(hand: Hand): -1 | 1 {
  return hand === 'lh' ? -1 : 1;
}

/** 某分区是否允许指定手从其接近侧进入（同时受岩点单侧开放约束） */
function zoneAccepts(zone: GripZone, hand: Hand, hold: Hold) {
  const side = handApproachSide(hand);
  if (hold.openSide !== undefined && hold.openSide !== side) return false;
  return zone.approach === 0 || zone.approach === side;
}

/**
 * 为一只手在宽点上规划实际握位，避开 reserved 分区。
 * 从该手接近侧起取连续分区；若被预留区或开放侧限制挡住，则向内回退。
 */
export function planHandGrip(hold: Hold, hand: Hand, reserved: string[] = []): HandGrip | null {
  const zones = gripZones(hold);
  if (!zones.length) return null;
  const side = handApproachSide(hand);
  const available = zones.filter(zone => !reserved.includes(zone.id));
  if (available.length < HAND_ZONES) return null;

  const ordered = side === -1 ? available : [...available].reverse();
  let picked: GripZone[] = [];
  for (let start = 0; start + HAND_ZONES <= ordered.length; start += 1) {
    const window = ordered.slice(start, start + HAND_ZONES);
    if (window.every(zone => zoneAccepts(zone, hand, hold))) {
      picked = window;
      break;
    }
  }
  if (picked.length < HAND_ZONES) return null;

  const center = { x: picked.reduce((sum, z) => sum + z.x, 0) / picked.length, y: 2 };
  const force = unit(picked.reduce((sum, z) => ({ x: sum.x + z.force.x, y: sum.y + z.force.y }), { x: 0, y: 0 }));
  return {
    zones: picked.map(z => z.id).sort(),
    fraction: picked.length / zones.length,
    center,
    force,
  };
}

/** 两个握位真正发生手指覆盖重叠的分区 id */
export function overlappingZones(a: HandGrip, b: HandGrip): string[] {
  return a.zones.filter(id => b.zones.includes(id));
}

/** 失去对捏夹持的分区 id：两手发力方向未形成相反方向 */
export function clampFailureZones(a: HandGrip, b: HandGrip): string[] {
  const dot = a.force.x * b.force.x + a.force.y * b.force.y;
  return dot <= CLAMP_DOT ? [] : [...new Set([...a.zones, ...b.zones])].sort();
}

/**
 * 两手是否都只能从同一侧接近：岩点只开放一侧，或可行握位全部落在同一外侧。
 * 总面积再充足也必须拒绝——不能把各自合法的握位直接叠起来。
 */
export function sameSideOnly(hold: Hold, grips: HandGrip[]): boolean {
  if (hold.openSide !== undefined) return true;
  const zones = gripZones(hold);
  const sides = grips.map(grip => {
    const used = new Set(grip.zones);
    const open = new Set(zones.filter(z => used.has(z.id)).map(z => z.approach).filter(v => v !== 0));
    return open.size === 1 ? ([...open][0] as -1 | 1) : 0;
  });
  return sides.every(side => side !== 0) && new Set(sides).size === 1;
}

export interface PlanStrength {
  /** 给定旧手保留面积比例（0..1）时，整个人体的支撑余量 */
  marginAt: (oldFraction: number, newFraction: number) => number;
}

/**
 * 构造从原握法到新握法的连续分配帧。
 * 旧手按 FRAME_STEP 逐档释放，新手在旧手让出空间后逐段落指；
 * 每一档都用实际覆盖面积重新核算支撑余量。
 */
function buildFrames(marginAt: PlanStrength['marginAt'], releaseNeeded: number): GripFrame[] {
  const frames: GripFrame[] = [];
  const steps = Math.round(releaseNeeded / FRAME_STEP);
  for (let i = 0; i <= steps; i += 1) {
    const released = Math.min(releaseNeeded, i * FRAME_STEP);
    const oldFraction = 1 - released;
    // 新手只有在旧手让出足够面积后才能落指，且自身覆盖不与旧手重叠
    const newFraction = Math.max(0, Math.min(released, HAND_ZONES / ZONE_COUNT));
    frames.push({
      index: i,
      oldFraction: Math.round(oldFraction * 100) / 100,
      newFraction: Math.round(newFraction * 100) / 100,
      margin: Math.round(marginAt(oldFraction, newFraction) * 10) / 10,
      released: Math.round(released * 100) / 100,
    });
  }
  return frames;
}

/**
 * 规划同点并握 / 挤压换手。
 * mode = match：新手落到旧手所在宽点，最终双手同点；
 * mode = squeeze：旧手从已并握的宽点让出，新手独占，过程中连续释放。
 */
export function planSharedGrip(
  hold: Hold,
  oldHand: Hand,
  newHand: Hand,
  mode: SharedGripPlan['mode'],
  marginAt: PlanStrength['marginAt'],
): SharedGripPlan | null {
  if (!isWideJug(hold) || oldHand === newHand) return null;

  // 旧手先按完整握位规划，再在其分区之外为新手寻找不重叠的握位
  const residentFull = planHandGrip(hold, oldHand);
  const incoming = planHandGrip(hold, newHand, residentFull?.zones ?? []);
  // 岩点仅开放单侧时，新手无法从其习惯侧接近——保留诊断信息交由上层拒绝
  if (!residentFull || !incoming) {
    const fallback = residentFull ?? {
      zones: gripZones(hold).slice(0, HAND_ZONES).map(z => z.id),
      fraction: HAND_ZONES / ZONE_COUNT,
      center: { x: 0, y: 2 }, force: { x: handApproachSide(oldHand), y: 0 },
    };
    return {
      mode,
      holdId: hold.id,
      oldHand,
      newHand,
      incoming: { zones: [], fraction: 0, center: { x: 0, y: 0 }, force: { x: 0, y: 0 } },
      resident: fallback,
      frames: [],
      releaseLimit: 0,
      releaseNeeded: 1,
      sameSideApproach: hold.openSide !== undefined,
      overlapZones: [],
      unclampedZones: [],
    };
  }

  // 旧手收缩到与新手互补的实际握位（5 分区中新手占 2，剩余 3 个足以容纳 2 分区握位）
  const resident = planHandGrip(hold, oldHand, incoming.zones) ?? residentFull;

  const overlapZones = overlappingZones(resident, incoming);
  const unclampedZones = clampFailureZones(resident, incoming);
  const sameSideApproach = sameSideOnly(hold, [resident, incoming]);

  // 旧手需从完整握位（100% 面积）释放到互补握位，新手才能完整落指
  const releaseNeeded = Math.round((1 - resident.fraction) * ZONE_COUNT) / ZONE_COUNT;
  const frames = buildFrames(marginAt, releaseNeeded);

  // 旧手在剩余支撑不跌破零的前提下，最多可释放的面积比例
  let releaseLimit = 1;
  for (const frame of frames) {
    if (frame.margin < 0) {
      releaseLimit = Math.round(frame.released * 100) / 100;
      break;
    }
  }

  return {
    mode,
    holdId: hold.id,
    oldHand,
    newHand,
    incoming,
    resident,
    frames,
    releaseLimit,
    releaseNeeded,
    sameSideApproach,
    overlapZones,
    unclampedZones,
  };
}
