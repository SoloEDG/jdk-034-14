import type { Contacts, GripState, MoveRecord, Preview, Route } from '../../../shared/types';
import { holdAt } from '../../wall/lib/holds';
import { isWideJug } from '../../wall/lib/grip';
import { gripsAfterMove } from './evaluate';

/** 执行成功后的握持分配 */
export function nextGripState(route: Route, grips: GripState, preview: Preview): GripState {
  const { move, shared } = preview;
  if (shared && !preview.failure && isWideJug(holdAt(route, move.target))) {
    return {
      ...grips,
      [move.target]: {
        [shared.oldHand]: shared.resident,
        [shared.newHand]: shared.incoming,
      } as GripState[string],
    };
  }
  return gripsAfterMove(route, grips, move.limb, move.target);
}

export function settle(route: Route, contacts: Contacts, energy: number, preview: Preview, grips: GripState = {}) {
  const record: MoveRecord = {
    ...preview,
    before: { ...contacts },
    energyBefore: energy,
    energyAfter: Math.max(0, energy - preview.cost),
    beforeGrips: JSON.parse(JSON.stringify(grips)) as GripState,
  };
  const finish = !preview.failure && route.finish === preview.move.target;
  const result = preview.failure ? 'fall' : finish ? 'success' : null;
  return { record, result } as const;
}
