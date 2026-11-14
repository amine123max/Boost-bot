<script lang="ts">
import {
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type PropType,
} from "vue";
import type { Bot } from "../types";
import type { BotAppearance } from "../../../shared/appearance/preferences";
import { mountBotAvatar } from "../../../shared/appearance/renderer";
import { brandAppearance } from "../host";
import { identityFor } from "../identity";
import { preferences } from '../preferences';
export default defineComponent({
  props: {
    bot: Object as PropType<Bot>,
    appearance: Object as PropType<BotAppearance>,
    brand: Boolean,
    ambient: { type: Boolean, default: true },
    working: Boolean,
    size: { default: 38 },
  },
  setup(props) {
    const svg = ref<SVGSVGElement>(),
      appearance = computed(
        () => {
          const base = props.appearance || (props.brand ? brandAppearance.value : identityFor(props.bot));
          return preferences.motion === 'full' ? base : {...base, animation:'still' as const};
        },
      );
    let avatar: ReturnType<typeof mountBotAvatar> | undefined;
    onMounted(() => {
      avatar = mountBotAvatar(
        svg.value!,
        () => appearance.value,
        () => ({ thinking: props.working, ambient: preferences.motion === 'full' && (props.brand || props.ambient) }),
      );
    });
    watch([appearance, () => props.working], () => avatar?.refresh(), {
      deep: true,
    });
    onBeforeUnmount(() => avatar?.dispose());
    return () =>
      h("svg", {
        ref: svg,
        class: "agent-avatar",
        width: props.size,
        height: props.size,
        "data-boost-bot-avatar": "",
      });
  },
});
</script>
