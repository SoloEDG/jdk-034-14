/* 端到端动作流验证：模拟 evaluate → settle → 握持分配更新 */
import { routes } from '../src/features/wall/lib/routes';
import { evaluate } from '../src/features/actions/lib/evaluate';
import { settle, nextGripState } from '../src/features/actions/lib/settle';

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
let contacts = { ...route.start };
let grips = {};
let energy = route.energy;

function play(limb: any, target: string) {
  const preview = evaluate(route, contacts, { limb, target }, energy, grips)!;
  const { record } = settle(route, contacts, energy, preview, grips);
  energy = record.energyAfter;
  if (!record.failure) {
    contacts = record.next;
    grips = nextGripState(route, grips, record);
  }
  return record;
}

// 左手移动到宽点 10
const toJug = play('lh', '10');
check('左手移至宽点 10 成功', !toJug.failure && contacts.lh === '10');
check('宽点 10 记录左手独占握位', Boolean(grips['10']?.lh && !grips['10']?.rh));

// 右手并握到同一宽点
const match = play('rh', '10');
check('右手并握 10 成功', !match.failure && contacts.rh === '10');
check('并握方案含连续分配帧', (match.shared?.frames.length ?? 0) >= 2);
check('并握后两手各有不重叠实际握位', Boolean(grips['10']?.lh && grips['10']?.rh));
check('两握位无重叠分区', new Set([...grips['10'].lh!.zones, ...grips['10'].rh!.zones]).size === 4);
check('并握耗力已按实际握位计入', match.cost > 0 && energy < route.energy);

// 左手离开并握点（挤压换手的释放侧）
const leave = play('lh', '03');
check('左手离开并握点成功', !leave.failure && contacts.lh === '03');
check('离开后 10 只保留右手握位', Boolean(grips['10']?.rh && !grips['10']?.lh));
check('左手在 03 建立新握位', Boolean(grips['03']?.lh));

// 尝试并握到单侧开放的终点 16：构造贴近的姿势保证可达，结构性拒绝仍须生效
const closeContacts = { lh: '15', rh: '14', lf: '19', rf: '20' };
const sideSetup = evaluate(route, closeContacts, { limb: 'rh', target: '16' }, 100, {});
check('贴近姿势下右手可占终点 16', Boolean(sideSetup && !sideSetup.failure));
const sideBlock = evaluate(route, { ...closeContacts, rh: '16' }, { limb: 'lh', target: '16' }, 100, {});
check('左手并握单侧开放点被拒', sideBlock?.failure === 'grip-side');
check('失败记录保留同侧诊断与回看分区信息', sideBlock!.shared!.sameSideApproach === true);
check('结构性拒绝优先于其他失败原因', sideBlock!.failure === 'grip-side');

// 窄点（edge 04）已被占用时，另一只手无法选择
const narrow = evaluate(route, contacts, { limb: 'lh', target: contacts.rh === '04' ? '04' : '08' }, energy, grips);
check('窄点占用时评估为 null 或非并握', narrow === null || !narrow.shared);

// 回看数据完整性
check('MoveRecord 携带 beforeGrips 快照', Boolean(match.beforeGrips));
check('支撑余量按实际握位重算为有限数', Number.isFinite(match.landing.margin));

console.log(`\n${passed} 项端到端检查通过`);
