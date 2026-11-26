import { ref } from 'vue';
import type { Contacts, GripState, Limb } from '../../../shared/types';

export function useLimbs(start: Contacts) {
  const selected = ref<Limb>('lh');
  const contacts = ref<Contacts>({ ...start });
  const grips = ref<GripState>({});
  function reset(next: Contacts) {
    contacts.value = { ...next };
    grips.value = {};
    selected.value = 'lh';
  }
  function land(next: Contacts, nextGrips: GripState) {
    contacts.value = { ...next };
    grips.value = nextGrips;
  }

  return { selected, contacts, grips, reset, land };
}
