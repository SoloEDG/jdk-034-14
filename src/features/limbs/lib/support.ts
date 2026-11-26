import { centroid, distance } from '../../../shared/geometry';
import type { Balance, Contacts, GripState, Limb, Point, Route } from '../../../shared/types';
import { grip, holdAt } from '../../wall/lib/holds';

export const limbs: Limb[] = ['lh', 'rh', 'lf', 'rf'];
export const limbNames = { lh: '左手', rh: '右手', lf: '左脚', rf: '右脚' };
export const limbTags = { lh: 'LH', rh: 'RH', lf: 'LF', rf: 'RF' };

/** 过渡帧中某肢体在某岩点上的实际握持面积比例（缺省为完整握持） */
export type PartialGrips = Record<string, Partial<Record<Limb, number>>>;

export function body(route: Route, contacts: Contacts): Point {
  const hands = centroid([holdAt(route, contacts.lh), holdAt(route, contacts.rh)]);
  const feet = centroid([holdAt(route, contacts.lf), holdAt(route, contacts.rf)]);
  return { x: hands.x * .52 + feet.x * .48, y: hands.y * .53 + feet.y * .47 };
}

function strengthOf(route: Route, contacts: Contacts, grips: GripState, partial: PartialGrips, limb: Limb) {
  const holdId = contacts[limb];
  const base = grip[holdAt(route, holdId).kind].support;
  const fraction = partial[holdId]?.[limb] ?? grips[holdId]?.[limb as 'lh' | 'rh']?.fraction ?? 1;
  return base * fraction;
}

export function balance(
  route: Route,
  contacts: Contacts,
  released?: Limb,
  grips: GripState = {},
  partial: PartialGrips = {},
): Balance {
  const anchors = limbs.filter(limb => limb !== released);
  const points = anchors.map(limb => holdAt(route, contacts[limb]));
  const center = body(route, contacts);
  const span = Math.max(...points.map(anchor => distance(center, anchor)));
  const leverage = Math.abs(center.x - centroid(points).x) / 34;
  const strength = anchors.reduce((sum, limb) => sum + strengthOf(route, contacts, grips, partial, limb), 0);
  const demand = 4.1 + route.tilt / 36 + leverage + Math.max(0, span - 106) / 62;
  return { margin: Math.round((strength - demand) * 10) / 10, span: Math.round(span) };
}
