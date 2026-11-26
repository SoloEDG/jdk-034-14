<script setup lang="ts">
import { computed } from 'vue';
import type { GripState, Hold, Route, SharedGripPlan } from '../../../shared/types';
import { gripZones, zonePoint } from '../lib/grip';
import { limbTags } from '../../limbs/lib/support';

const props = defineProps<{
  route: Route;
  grips: GripState;
  plan?: SharedGripPlan | null;
}>();

interface ZoneView {
  hold: Hold;
  zoneId: string;
  x: number;
  y: number;
  half: number;
  kind: 'lh' | 'rh' | 'overlap' | 'unclamped';
  label?: string;
  forceAngle?: number;
}

const views = computed<ZoneView[]>(() => {
  const out: ZoneView[] = [];
  const pushGrip = (hold: Hold, hand: 'lh' | 'rh', zones: string[], kind: ZoneView['kind']) => {
    for (const zone of gripZones(hold).filter(z => zones.includes(z.id))) {
      const p = zonePoint(hold, zone);
      out.push({
        hold, zoneId: zone.id, x: p.x, y: p.y, half: zone.half, kind,
        label: limbTags[hand],
        forceAngle: (Math.atan2(zone.force.y, zone.force.x) * 180) / Math.PI + hold.angle,
      });
    }
  };

  for (const [holdId, entry] of Object.entries(props.grips)) {
    const hold = props.route.holds.find(h => h.id === holdId);
    if (!hold) continue;
    if (entry.lh) pushGrip(hold, 'lh', entry.lh.zones, 'lh');
    if (entry.rh) pushGrip(hold, 'rh', entry.rh.zones, 'rh');
  }

  if (props.plan) {
    const hold = props.route.holds.find(h => h.id === props.plan!.holdId);
    if (hold) {
      const bad = new Set([...props.plan.overlapZones, ...props.plan.unclampedZones]);
      for (const zone of gripZones(hold)) {
        if (!bad.has(zone.id)) continue;
        const p = zonePoint(hold, zone);
        out.push({
          hold, zoneId: zone.id, x: p.x, y: p.y, half: zone.half,
          kind: props.plan.overlapZones.includes(zone.id) ? 'overlap' : 'unclamped',
        });
      }
    }
  }
  return out;
});

const arrow = { dx: 7, dy: 0 };
</script>

<template>
  <g class="grip-overlay" aria-hidden="true">
    <g v-for="view in views" :key="view.zoneId + view.kind" :transform="'translate(' + view.x + ' ' + view.y + ') rotate(' + view.hold.angle + ')'">
      <rect class="grip-zone" :class="view.kind" :x="-view.half" y="-9" :width="view.half * 2" height="8" rx="2" />
      <g v-if="view.forceAngle !== undefined && view.kind !== 'overlap'" :transform="'rotate(' + (view.forceAngle - view.hold.angle) + ')'">
        <line class="grip-force" :x1="-arrow.dx" :y1="-arrow.dy" :x2="arrow.dx" :y2="arrow.dy" />
      </g>
      <text v-if="view.label" class="grip-tag" :class="view.kind" y="-12">{{ view.label }}</text>
    </g>
  </g>
</template>
