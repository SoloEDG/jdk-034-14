/* 领域逻辑验证：经 esbuild 打包后用 node 运行 */
import { routes } from '../src/features/wall/lib/routes';
import { holdAt } from '../src/features/wall/lib/holds';
import {
  gripZones, planHandGrip, planSharedGrip, overlappingZones, clampFailureZones, sameSideOnly,
} from '../src/features/wall/lib/grip';
import { balance } from '../src/features/limbs/lib/support';
import { evaluate, gripsAfterMove } from '../src/features/actions/lib/evaluate';

let passed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (!cond) {
    console.error(`✗ ${name} ${extra}`);
    process.exitCode = 1;
  } else {
    passed += 1;
    console.log(`✓ ${name}`);
  }
}

const route = routes[0];
const start = route.start;

// 1. 宽点分区：5 个原子分区，两手各取 2 个时可做到不重叠
const jug = holdAt(route, '09');
const zones = gripZones(jug);
check('宽点有 5 个原子握持分区', zones.length === 5);
const lhGrip = planHandGrip(jug, 'lh');
const rhGrip = planHandGrip(jug, 'rh', lhGrip!.zones);
check('双手各 2 分区且覆盖不重叠', Boolean(lhGrip && rhGrip && overlappingZones(lhGrip, rhGrip).length === 0),
  JSON.stringify({ lh: lhGrip?.zones, rh: rhGrip?.zones }));
check('对捏发力方向相反（点积 <= -0.5）', clampFailureZones(lhGrip!, rhGrip!).length === 0);

// 2. 连续分配帧与释放上限
const marginAt = (oldF: number, newF: number) =>
  balance(route, start, 'rh', {}, { '09': { lh: oldF, rh: newF } }).margin;
const plan = planSharedGrip(jug, 'lh', 'rh', 'match', marginAt);
check('生成连续分配帧', Boolean(plan && plan.frames.length >= 3));
check('帧从旧手 100% 过渡到保留 40%', plan!.frames[0].oldFraction === 1 && plan!.frames.at(-1)!.oldFraction === 0.4);
check('所需最小释放为 60%（5 分区中让出 3 个）', plan!.releaseNeeded === 0.6);
check('每帧都带实时支撑余量', plan!.frames.every(f => typeof f.margin === 'number'));

// 3. evaluate：已占用宽点不再返回 null，普通窄点仍拒绝
const setup = { ...start, lh: '09' };
const matchPreview = evaluate(route, setup, { limb: 'rh', target: '09' }, 100, {});
check('已占用宽点可生成并握预览', Boolean(matchPreview?.shared));
check('并握预览落点两手同点', matchPreview!.next.lh === '09' && matchPreview!.next.rh === '09');
const edge = holdAt(route, '04');
const blocked = evaluate(route, { ...start, rh: '04' }, { limb: 'lh', target: '04' }, 100, {});
check('普通窄点已占用仍被拒绝（单肢体占用）', blocked === null);
check('脚点不接受手', evaluate(route, start, { limb: 'lh', target: '01' }, 100, {}) === null);
void edge;

// 4. 单侧开放宽点：结构性拒绝
const oneSided = routes[0].holds.find(h => h.id === '16')!;
check('16 号点只开放右侧', oneSided.openSide === 1);
const sidePlan = planSharedGrip(oneSided, 'rh', 'lh', 'match', () => 5);
check('同侧接近被标记拒绝', Boolean(sidePlan?.sameSideApproach));
const sidePreview = evaluate(route, { ...start, rh: '16' }, { limb: 'lh', target: '16' }, 100, {});
check('同侧预览失败原因为 grip-side', sidePreview?.failure === 'grip-side');

// 5. 失败回看携带真实重叠/失夹区域
const overlap = overlappingZones(lhGrip!, lhGrip!);
check('相同握位能检出真实重叠分区', overlap.length === lhGrip!.zones.length);
const badClamp = clampFailureZones(lhGrip!, lhGrip!);
check('同向发力能检出失去夹持分区', badClamp.length > 0);
check('sameSideOnly 对双侧开放的正常并握为 false', sameSideOnly(jug, [lhGrip!, rhGrip!]) === false);

// 6. 成功并握后的握持分配与耗力/可达性重算
const grips = gripsAfterMove(route, {}, 'lh', '09');
check('独占宽点记录单手握位', Boolean(grips['09']?.lh && !grips['09']?.rh));
const sharedLanding = balance(route, matchPreview!.next, undefined, {
  '09': { lh: matchPreview!.shared!.resident, rh: matchPreview!.shared!.incoming },
});
check('并握落点按实际握位重算支撑', typeof sharedLanding.margin === 'number');
check('并握耗力已按释放面积重算（> 普通 jug 成本）', matchPreview!.cost >= 1);

// 7. 挤压换手：旧手离开并握点后，分配被清理
const matched: typeof grips = {
  '09': { lh: matchPreview!.shared!.resident, rh: matchPreview!.shared!.incoming },
};
const afterLeave = gripsAfterMove(route, matched, 'lh', '10');
check('旧手离开后并握点只留新手握位', Boolean(afterLeave['09']?.rh && !afterLeave['09']?.lh));
check('旧手在新点建立独占握位', Boolean(afterLeave['10']?.lh));

console.log(`\n${passed} 项检查通过`);
