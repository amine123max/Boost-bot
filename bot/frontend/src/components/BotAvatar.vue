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
export default defineComponent({
  props: {
    bot: Object as PropType<Bot>,
    appearance: Object as PropType<BotAppearance>,
    brand: Boolean,
    working: Boolean,
    size: { default: 38 },
  },
  setup(props) {
    const svg = ref<SVGSVGElement>(),
      appearance = computed(
        () =>
          props.appearance ||
          (props.brand ? brandAppearance.value : identityFor(props.bot)),
      );
    let avatar: ReturnType<typeof mountBotAvatar> | undefined;
    onMounted(() => {
      avatar = mountBotAvatar(
        svg.value!,
        () => appearance.value,
        () => ({ thinking: props.working, ambient: props.brand }),
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
