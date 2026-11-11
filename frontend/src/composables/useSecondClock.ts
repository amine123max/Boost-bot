import {
  ref,
  onMounted,
  onActivated,
  onDeactivated,
  onBeforeUnmount,
} from "vue";
const now = ref(Date.now());
let consumers = 0;
let timer: ReturnType<typeof setInterval> | undefined;
export function useSecondClock() {
  let active = false;
  function start() {
    if (active) return;
    active = true;
    consumers++;
    if (!timer) {
      now.value = Date.now();
      timer = setInterval(() => {
        now.value = Date.now();
      }, 1000);
    }
  }
  function stop() {
    if (!active) return;
    active = false;
    consumers--;
    if (!consumers) {
      clearInterval(timer);
      timer = undefined;
    }
  }
  onMounted(start);
  onActivated(start);
  onDeactivated(stop);
  onBeforeUnmount(stop);
  return now;
}
