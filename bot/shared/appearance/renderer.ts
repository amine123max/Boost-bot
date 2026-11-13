import { sampleSupportAvatar } from './supportAvatar.js';
import { avatarColors, type BotAppearance } from './preferences.js';

let identity = 0;
/** Shared by the Vue navigation and the imported Bot workspace. */
export function mountBotAvatar(svg: SVGSVGElement, preferences: () => BotAppearance, interaction: () => { active?: boolean; thinking?: boolean; ambient?: boolean } = () => ({})) {
  const id = `boost-bot-clip-${++identity}`;
  svg.setAttribute('viewBox', '-4 -4 72 72');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  // Fixed markup only. Model/user text is never inserted into SVG markup.
  svg.innerHTML = `<defs><clipPath id="${id}"><path/></clipPath></defs><g data-character><path data-body stroke-width=".5"/><g clip-path="url(#${id})"><g data-face><g data-gaze><path data-left/><path data-right/></g></g></g></g>`;
  const get = (selector: string) => svg.querySelector(selector)!;
  const body = get('[data-body]'), clip = get('clipPath path'), character = get('[data-character]');
  const face = get('[data-face]'), gaze = get('[data-gaze]'), left = get('[data-left]'), right = get('[data-right]');
  let frame = 0, last = 0, time = 0, attention = 0, gazeX = 0, gazeY = 0, pointerX = 0, pointerY = 0, pointerAt = -Infinity;
  let visible = true, disposed = false;
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  function darkTheme() { return getComputedStyle(svg).colorScheme.split(' ').includes('dark'); }
  // Style/layout reads once on theme change, never once per avatar per frame.
  let dark = darkTheme(), colorKey = '';
  let colors = { ink: '', eyes: '' };
  function draw(now: number) {
    if (disposed || !visible || document.hidden) return;
    const prefs = preferences();
    const state = interaction();
    // The navigation mascot is part of the brand and always retains its idle motion.
    // Chat avatars still respect the static preset and system reduced-motion setting.
    const gentle = !!state.ambient && (media.matches || prefs.animation === 'still');
    const reduced = (prefs.animation === 'still' && !state.ambient) || (media.matches && !gentle);
    const dt = last ? Math.min((now - last) / 1000, .064) : 1 / 60;
    last = now;
    if (!reduced) time += dt * prefs.speed * (gentle ? .65 : 1);
    const smooth = 1 - Math.exp(-dt * 9);
    const tracking = prefs.followPointer && !reduced && !gentle ? Math.max(0, Math.min(1, 1 - (now - pointerAt - 1200) / 900)) : 0;
    attention += (Number(!!state.active) - attention) * smooth;
    gazeX += (pointerX * tracking - gazeX) * smooth;
    gazeY += (pointerY * tracking - gazeY) * smooth;
    const pose = sampleSupportAvatar(reduced ? 0 : time, { attention, gazeX, gazeY, thinking: gentle ? false : state.thinking, animation: reduced ? 'still' : gentle ? 'natural' : prefs.animation, contour: gentle && prefs.contour === 'auto' ? 'squircle' : prefs.contour, dark });
    const nextColorKey = `${prefs.palette}:${prefs.customColor}:${dark}:${prefs.palette === 'cycle' ? pose.ink : ''}`;
    if (nextColorKey !== colorKey) { colorKey = nextColorKey; colors = avatarColors(prefs, pose.ink, dark); }
    body.setAttribute('d', pose.body); clip.setAttribute('d', pose.body);
    body.setAttribute('fill', colors.ink); body.setAttribute('stroke', colors.ink);
    character.setAttribute('transform', pose.bodyTransform);
    face.setAttribute('transform', pose.faceTransform);
    gaze.setAttribute('transform', pose.transform); gaze.setAttribute('fill', colors.eyes);
    left.setAttribute('d', pose.left); right.setAttribute('d', pose.right);
    svg.dataset.expression = pose.expression;
    svg.dataset.bodyShape = pose.bodyShape;
    svg.dataset.botMotion = reduced ? 'still' : gentle ? 'gentle' : 'animated';
    if (!reduced) frame = requestAnimationFrame(draw);
  }
  function resume() { cancelAnimationFrame(frame); last = 0; if (!disposed && visible && !document.hidden) frame = requestAnimationFrame(draw); }
  function pointer(event: PointerEvent) {
    if (event.pointerType === 'touch' || media.matches || !visible || !preferences().followPointer) return;
    const box = svg.getBoundingClientRect();
    pointerX = Math.tanh((event.clientX - box.left - box.width / 2) / 180) * 3.2;
    pointerY = Math.tanh((event.clientY - box.top - box.height / 2) / 160) * 2;
    pointerAt = performance.now();
  }
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume(); });
  const themeObserver = new MutationObserver(() => { dark = darkTheme(); resume(); });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  observer.observe(svg);
  window.addEventListener('pointermove', pointer, { passive: true });
  document.addEventListener('visibilitychange', resume);
  media.addEventListener('change', resume);
  resume();
  return { refresh: resume, dispose() {
    disposed = true; cancelAnimationFrame(frame); observer.disconnect(); themeObserver.disconnect();
    window.removeEventListener('pointermove', pointer);
    document.removeEventListener('visibilitychange', resume);
    media.removeEventListener('change', resume);
  } };
}
