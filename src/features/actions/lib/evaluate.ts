import type {
  Contacts, GripState, Hand, HandGrip, Limb, Move, Preview, Route, SharedGripPlan,
} from '../../../shared/types';
import { holdAt } from '../../wall/lib/holds';
import { isWideJug, planHandGrip, planSharedGrip } from '../../wall/lib/grip';
import { balance, type PartialGrips } from '../../limbs/lib/support';
import { isHand, measureReach } from '../../limbs/lib/reach';
import { moveCost } from '../../stamina/lib/cost';

export function evaluate(
  route: Route,
  contacts: Contacts,
  move: Move,
  energy: number,
  grips: GripState = {},
): Preview | null {
  const target = holdAt(route, move.target);
  const targetHands = Object.entries(contacts)
    .filter(([, id]) => id === target.id)
    .map(([limb]) => limb as Limb);
  const occupied = targetHands.length > 0;
  const handMismatch = isHand(move.limb) === (target.kind === 'step');
  if (handMismatch) return null;

  const measure = measureReach(route, contacts, move.limb, target.id, energy);
  const next = { ...contacts, [move.limb]: target.id };

  // 普通窄点 / 脚点保持单肢体占用：已占用即不可选
  if (occupied && (!isWideJug(target) || !isHand(move.limb))) return null;

  if (!occupied) {
    const support = balance(route, contacts, move.limb, grips);
    const landing = balance(route, next, undefined, gripsAfterMove(route, grips, move.limb, target.id));
    const cost = moveCost(measure.travel, target.kind, route.tilt, support.margin);
    const failure = measure.distance > measure.reach ? 'reach'
      : support.margin < 0 || landing.margin < 0 ? 'support'
        : energy < cost ? 'energy' : null;
    return { move, next, cost, distance: measure.distance, reach: measure.reach, support, landing, failure };
  }

  // 同点并握 / 挤压换手：目标是已被另一只手占用的宽把手点
  const residentLimb = targetHands.find(limb => limb !== move.limb);
  if (!residentLimb || !isHand(residentLimb)) return null;
  return evaluateShared(route, contacts, grips, move, residentLimb as Hand, target.id, measure, energy);
}

function evaluateShared(
  route: Route,
  contacts: Contacts,
  grips: GripState,
  move: Move,
  resident: Hand,
  holdId: string,
  measure: ReturnType<typeof measureReach>,
  energy: number,
): Preview {
  const hold = holdAt(route, holdId);
  const incoming = move.limb as Hand;
  const existing = grips[holdId]?.[resident];
  const residentGrip: HandGrip = existing ?? planHandGrip(hold, resident) ?? {
    zones: [], fraction: 1, center: { x: 0, y: 0 }, force: { x: 0, y: -1 },
  };

  // 过渡帧：移动手离点，旧手按保留面积提供支撑，新手按已落指面积分担
  const marginAt = (oldFraction: number, newFraction: number) => {
    const partial: PartialGrips = {
      [holdId]: { [resident]: oldFraction, [incoming]: newFraction },
    };
    return balance(route, contacts, move.limb, grips, partial).margin;
  };

  const plan = planSharedGrip(hold, resident, incoming, 'match', marginAt);
  const next = { ...contacts, [move.limb]: holdId };
  const nextGrips = plan
    ? gripsAfterMatch(grips, holdId, resident, plan.resident, incoming, plan.incoming)
    : grips;
  const support = balance(route, contacts, move.limb, grips);
  const landing = plan ? balance(route, next, undefined, nextGrips) : support;

  const failure = planFailure(plan, measure, support, landing, energy, moveCost(measure.travel, hold.kind, route.tilt, support.margin));
  const cost = sharedCost(plan, measure.travel, route.tilt, support.margin);
  return {
    move, next,
    cost,
    distance: measure.distance,
    reach: measure.reach,
    support,
    landing,
    failure,
    shared: plan ?? {
      mode: 'match', holdId, oldHand: resident, newHand: incoming,
      incoming: { zones: [], fraction: 0, center: { x: 0, y: 0 }, force: { x: 0, y: 0 } },
      resident: residentGrip,
      frames: [], releaseLimit: 0, releaseNeeded: 1,
      sameSideApproach: Boolean(hold.openSide !== undefined),
      overlapZones: [], unclampedZones: [],
    },
  };
}

function planFailure(
  plan: SharedGripPlan | null,
  measure: { distance: number; reach: number },
  support: { margin: number },
  landing: { margin: number },
  energy: number,
  cost: number,
): Preview['failure'] {
  // 结构性握持缺陷优先：同侧接近、覆盖重叠、夹持失效，不被可达性等条件掩盖
  if (!plan) return 'grip-overlap';
  if (plan.sameSideApproach) return 'grip-side';
  if (plan.overlapZones.length > 0) return 'grip-overlap';
  if (plan.unclampedZones.length > 0) return 'grip-clamp';
  if (measure.distance > measure.reach) return 'reach';
  if (support.margin < 0 || landing.margin < 0 || plan.releaseLimit < plan.releaseNeeded) return 'support';
  if (energy < cost) return 'energy';
  return null;
}

function sharedCost(plan: SharedGripPlan | null, travel: number, tilt: number, supportMargin: number) {
  const base = moveCost(travel, 'jug', tilt, supportMargin);
  if (!plan) return base;
  // 并握握位比独占更窄，按旧手让出的面积比例增加耗力
  return base + Math.round(plan.releaseNeeded * 3);
}

/** 普通移动后的握持分配：清空该肢体在旧点的并握记录，新点独占 */
export function gripsAfterMove(
  route: Route,
  grips: GripState,
  limb: Limb,
  targetId: string,
): GripState {
  const next: GripState = {};
  for (const [holdId, entry] of Object.entries(grips)) {
    const kept = Object.fromEntries(Object.entries(entry).filter(([hand]) => hand !== limb)) as GripState[string];
    if (kept.lh || kept.rh) next[holdId] = kept;
  }
  const target = holdAt(route, targetId);
  if (isWideJug(target) && (limb === 'lh' || limb === 'rh')) {
    next[targetId] = { ...next[targetId], [limb]: planHandGrip(target, limb) ?? undefined };
  }
  return next;
}

/** 并握成功后的握持分配：两手各持实际握位 */
function gripsAfterMatch(
  grips: GripState,
  holdId: string,
  resident: Hand,
  residentGrip: HandGrip,
  incoming: Hand,
  incomingGrip: HandGrip,
): GripState {
  return {
    ...grips,
    [holdId]: { [resident]: residentGrip, [incoming]: incomingGrip },
  };
}

export const failures = {
  reach: '超出可触及范围',
  support: '身体支撑不足，旧手释放后剩余支撑跌破安全线',
  energy: '剩余体力不足',
  'grip-side': '宽点只开放单侧，两手只能从同一侧接近，无法并握',
  'grip-overlap': '手指覆盖发生重叠，不能把各自合法握位直接叠起来',
  'grip-clamp': '两手对捏区域未形成相反发力方向，夹持失效',
};
