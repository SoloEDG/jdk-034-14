<script setup lang="ts">
import { Hand, Layers, TriangleAlert } from 'lucide-vue-next';
import { computed } from 'vue';
import type { GripFrame, SharedGripPlan } from '../../../shared/types';
import { limbNames } from '../../limbs';

const props = defineProps<{ plan: SharedGripPlan }>();

const modeName = computed(() => props.plan.mode === 'match' ? '同点并握' : '挤压换手');
const supportBreaks = computed(() => props.plan.frames.filter(frame => frame.margin < 0));
const willBreak = computed(() => props.plan.releaseLimit < props.plan.releaseNeeded);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const oldTitle = (frame: GripFrame) => `旧手保留 ${pct(frame.oldFraction)}`;
const newTitle = (frame: GripFrame) => `新手落指 ${pct(frame.newFraction)}`;
const breakPoint = computed(() => supportBreaks.value[0] ?? null);
</script>

<template>
  <section class="console-section shared-panel" aria-label="换手连续分配">
    <h2><Hand :size="15" /> {{ modeName }} · 岩点 {{ plan.holdId }}</h2>
    <p class="shared-hands">
      {{ limbNames[plan.oldHand] }}保留 {{ pct(plan.resident.fraction) }}
      · {{ limbNames[plan.newHand] }}落指 {{ pct(plan.incoming.fraction) }}
    </p>

    <div class="frame-track" role="list" aria-label="连续分配帧">
      <div v-for="frame in plan.frames" :key="frame.index" class="frame"
        :class="{broken: frame.margin < 0}" role="listitem">
        <span class="frame-index">f{{ frame.index }}</span>
        <div class="frame-bars">
          <i class="bar-old" :style="{height: pct(frame.oldFraction)}" :title="oldTitle(frame)"></i>
          <i class="bar-new" :style="{height: pct(frame.newFraction)}" :title="newTitle(frame)"></i>
        </div>
        <b :class="{negative: frame.margin < 0}">{{ frame.margin }}</b>
        <small>释放 {{ pct(frame.released) }}</small>
      </div>
    </div>

    <dl class="shared-data">
      <div><dt>完成所需最小释放</dt><dd>{{ pct(plan.releaseNeeded) }}</dd></div>
      <div><dt>支撑跌破前可释放上限</dt><dd :class="{negative: willBreak}">{{ pct(plan.releaseLimit) }}</dd></div>
    </dl>

    <p v-if="willBreak && breakPoint" class="action-warning" role="status">
      <TriangleAlert :size="14" />
      旧手释放至 {{ pct(breakPoint.released) }} 时剩余支撑已不足（余量 {{ breakPoint.margin }}）
    </p>
    <p v-if="plan.sameSideApproach" class="action-warning" role="status">
      <Layers :size="14" /> 两手只能从同一侧接近，拒绝叠加握位
    </p>
    <p v-else-if="plan.overlapZones.length" class="action-warning" role="status">
      重叠分区：{{ plan.overlapZones.join('、') }}
    </p>
    <p v-else-if="plan.unclampedZones.length" class="action-warning" role="status">
      失去夹持分区：{{ plan.unclampedZones.join('、') }}（发力方向未相反）
    </p>
  </section>
</template>
