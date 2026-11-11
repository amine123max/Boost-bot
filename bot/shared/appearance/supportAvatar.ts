import type { FlowAnimation, FlowContour } from './flowStyle.js'
import { closedAvatarPath, precision, type AvatarPoint } from './avatarGeometry.js'
import { sampleFlowContour } from './flowContour.js'

type Eye = {
  width: number
  height: number
  bend: number
  tilt: number
  roundness: number
  shape: number
  y: number
}

type Pose = {
  left: Eye
  right: Eye
  x: number
  y: number
  tilt: number
  palette: number
}

type Scene = { name: string, duration: number, pose: Pose }
export type AvatarInteraction = { attention?: number, gazeX?: number, gazeY?: number, thinking?: boolean, animation?: FlowAnimation, dark?: boolean, contour?: FlowContour }

const neutralEye: Eye = { width: 8.5, height: 20, bend: 0, tilt: 0, roundness: 3, shape: 0, y: 0 }
const eye = (changes: Partial<Eye> = {}): Eye => ({ ...neutralEye, ...changes })
const pose = (changes: Partial<Pose> = {}): Pose => ({ left: eye(), right: eye(), x: 0, y: 0, tilt: 0, palette: 0, ...changes })

// Holds give each gesture time to read; short transitions hide shape changes in a blink.
const scenes: Scene[] = [
  { name: 'idle', duration: 2.8, pose: pose() },
  { name: 'curious-left', duration: 2.2, pose: pose({ x: -3, tilt: -7, left: eye({ width: 7, height: 17 }), right: eye({ height: 23 }), palette: 1 }) },
  { name: 'curious-right', duration: 2.2, pose: pose({ x: 3, tilt: 7, left: eye({ height: 23 }), right: eye({ width: 7, height: 17 }), palette: 2 }) },
  { name: 'wide', duration: 1.9, pose: pose({ left: eye({ width: 14, height: 19, roundness: 2 }), right: eye({ width: 14, height: 19, roundness: 2 }), y: -1, palette: 3 }) },
  { name: 'wink-left', duration: 1.4, pose: pose({ left: eye({ width: 13, height: 2.2, bend: 2 }), right: eye({ height: 21 }), tilt: -5, palette: 4 }) },
  { name: 'smile', duration: 2.5, pose: pose({ left: eye({ width: 16, height: 3.5, bend: 7 }), right: eye({ width: 16, height: 3.5, bend: 7 }), y: -0.8, palette: 5 }) },
  { name: 'thoughtful', duration: 2.3, pose: pose({ left: eye({ width: 11, height: 8, tilt: -16 }), right: eye({ width: 9, height: 19, tilt: 9 }), x: 1, y: -1, tilt: -5, palette: 2 }) },
  { name: 'wink-right', duration: 1.4, pose: pose({ left: eye({ height: 21 }), right: eye({ width: 13, height: 2.2, bend: 2 }), tilt: 5, palette: 1 }) },
  { name: 'sleepy', duration: 2.1, pose: pose({ left: eye({ width: 12, height: 5, bend: -2 }), right: eye({ width: 12, height: 5, bend: -2 }), y: 1.4, tilt: -3, palette: 4 }) },
  { name: 'wake', duration: 1.7, pose: pose({ left: eye({ width: 12, height: 23, roundness: 2 }), right: eye({ width: 12, height: 23, roundness: 2 }), y: -1, palette: 3 }) },
  { name: 'hearts', duration: 2.5, pose: pose({ left: eye({ width: 17, height: 18, shape: 1 }), right: eye({ width: 17, height: 18, shape: 1 }), palette: 6 }) },
  { name: 'happy-squint', duration: 2.0, pose: pose({ left: eye({ width: 15, height: 4, bend: 5, tilt: -8 }), right: eye({ width: 15, height: 4, bend: 5, tilt: 8 }), palette: 5 }) },
  { name: 'sparkles', duration: 2.3, pose: pose({ left: eye({ width: 17, height: 19, shape: 2 }), right: eye({ width: 17, height: 19, shape: 2 }), palette: 7 }) },
  { name: 'look-up', duration: 2.0, pose: pose({ x: -1, y: -3, left: eye({ height: 18 }), right: eye({ height: 21 }), palette: 2 }) },
  { name: 'content', duration: 2.2, pose: pose({ left: eye({ width: 13, height: 5, bend: 4 }), right: eye({ width: 13, height: 5, bend: 4 }), palette: 1 }) },
  { name: 'jelly', duration: 2.4, pose: pose({ left: eye({ width: 12, height: 14 }), right: eye({ width: 12, height: 14 }), palette: 4 }) },
  { name: 'wave', duration: 2.6, pose: pose({ left: eye({ width: 14, height: 4, bend: 5 }), right: eye({ width: 14, height: 4, bend: 5 }), palette: 5 }) },
  { name: 'orbit', duration: 3.2, pose: pose({ left: eye({ width: 10, height: 19 }), right: eye({ width: 10, height: 19 }), palette: 2 }) },
  { name: 'bounce', duration: 2.5, pose: pose({ left: eye({ width: 14, height: 4, bend: 6 }), right: eye({ width: 14, height: 4, bend: 6 }), palette: 3 }) },
  { name: 'spin', duration: 2.2, pose: pose({ left: eye({ width: 10, height: 17 }), right: eye({ width: 10, height: 17 }), palette: 7 }) },
  { name: 'greeting', duration: 2.8, pose: pose({ left: eye({ width: 14, height: 4, bend: 5 }), right: eye({ width: 14, height: 4, bend: 5 }), palette: 1 }) },
  { name: 'excited', duration: 2.6, pose: pose({ left: eye({ width: 15, height: 17, shape: 2 }), right: eye({ width: 15, height: 17, shape: 2 }), palette: 6 }) },
  { name: 'rest', duration: 3.0, pose: pose() }
]

export const supportAvatarCycle = scenes.reduce((total, scene) => total + scene.duration, 0)
const sceneNames: Record<Exclude<FlowAnimation, 'auto' | 'still'>, string[]> = {
  natural: ['idle', 'rest'],
  curious: ['idle', 'curious-left', 'curious-right', 'look-up', 'rest'],
  playful: ['idle', 'wink-left', 'smile', 'wink-right', 'happy-squint', 'rest'],
  hearts: ['idle', 'hearts', 'content', 'rest'],
  sparkles: ['idle', 'sparkles', 'wide', 'rest'],
  sleepy: ['idle', 'sleepy', 'wake', 'rest'],
  morph: ['idle', 'wide', 'thoughtful', 'smile', 'sparkles', 'content'],
  jelly: ['idle', 'jelly', 'smile', 'jelly'],
  wave: ['idle', 'wave', 'content', 'wave'],
  orbit: ['idle', 'orbit', 'look-up', 'orbit'],
  bounce: ['idle', 'bounce', 'smile', 'bounce'],
  spin: ['idle', 'spin', 'wide', 'spin'],
  greeting: ['idle', 'greeting', 'wink-left', 'greeting'],
  excited: ['idle', 'excited', 'hearts', 'happy-squint']
}
const sequences = Object.fromEntries(Object.entries(sceneNames).map(([name, names]) => [name, names.map(id => scenes.find(scene => scene.name === id)!)])) as Record<keyof typeof sceneNames, Scene[]>
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const mix = (a: number, b: number, amount: number) => a + (b - a) * amount
const ease = (value: number) => {
  const t = clamp(value)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function blendEye(a: Eye, b: Eye, amount: number): Eye {
  return {
    width: mix(a.width, b.width, amount), height: mix(a.height, b.height, amount),
    bend: mix(a.bend, b.bend, amount), tilt: mix(a.tilt, b.tilt, amount),
    roundness: mix(a.roundness, b.roundness, amount), shape: mix(a.shape, b.shape, amount), y: mix(a.y, b.y, amount)
  }
}

function eyePath(config: Eye, centerX: number, blink: number) {
  const points: AvatarPoint[] = []
  const heart = clamp(1 - Math.abs(config.shape - 1))
  const star = clamp(config.shape - 1)
  const base = 1 - heart - star
  const rotation = config.tilt * Math.PI / 180
  for (let i = 0; i < 32; i++) {
    const t = i * Math.PI / 16
    const angle = t - Math.PI / 2
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const u = Math.sign(cosine) * Math.abs(cosine) ** (2 / config.roundness)
    const v = Math.sign(sine) * Math.abs(sine) ** (2 / config.roundness)
    const starRadius = 0.73 + 0.27 * Math.cos(t * 4)
    const x = config.width / 2 * (base * u + heart * Math.sin(t) ** 3 + star * starRadius * cosine)
    const heartY = (-13 * Math.cos(t) + 5 * Math.cos(2 * t) + 2 * Math.cos(3 * t) + Math.cos(4 * t) - 2.5) / 14.5
    const y = (config.height / 2 * (base * v + heart * heartY + star * starRadius * sine) + base * config.bend * (u * u - 0.5)) * blink
    points.push([centerX + x * Math.cos(rotation) - y * Math.sin(rotation), 32 + config.y + x * Math.sin(rotation) + y * Math.cos(rotation)])
  }
  return closedAvatarPath(points)
}

// Local opaque body colors. Eyes choose their contrasting fill in the component.
const palettes = [
  [17, 17, 19],
  [21, 97, 77],
  [44, 85, 173],
  [151, 92, 22],
  [105, 68, 164],
  [23, 111, 118],
  [177, 54, 99],
  [176, 83, 35]
]

function color(a: number[], b: number[], amount: number) {
  return `rgb(${a.map((value, i) => Math.round(mix(value, b[i]!, amount))).join(' ')})`
}

function blinkAt(time: number, at: number, duration = 0.19) {
  const progress = (time - at) / duration
  if (progress <= 0 || progress >= 1) return 1
  return 1 - 0.91 * Math.sin(Math.PI * progress) ** 2
}

export function sampleSupportAvatar(seconds: number, interaction: AvatarInteraction = {}) {
  const animation = interaction.animation || 'auto'
  const still = animation === 'still'
  const sequence = animation === 'auto' || still ? scenes : sequences[animation]
  const duration = sequence.reduce((total, scene) => total + scene.duration, 0)
  const time = still ? 0 : ((seconds % duration) + duration) % duration
  let local = time
  let index = 0
  while (index < sequence.length - 1 && local >= sequence[index]!.duration) local -= sequence[index++]!.duration
  const scene = sequence[index]!
  const previous = sequence[(index + sequence.length - 1) % sequence.length]!.pose
  const target = scene.pose
  const shapeChange = previous.left.shape !== target.left.shape
  const amount = ease(local / (shapeChange ? 0.38 : 0.72))
  let left = blendEye(previous.left, target.left, amount)
  let right = blendEye(previous.right, target.right, amount)
  const attention = still ? 0 : clamp(interaction.attention || 0)
  const attentive = eye({ width: 10, height: 21, bend: 0.8 })
  left = blendEye(left, attentive, attention * 0.48)
  right = blendEye(right, attentive, attention * 0.48)
  if (interaction.thinking && !still) {
    const squint = (Math.sin(seconds * 3.2) + 1) / 2
    left = blendEye(left, eye({ height: 8, width: 11, tilt: -12 }), squint * 0.7)
    right = blendEye(right, eye({ height: 22, width: 8 }), squint * 0.7)
  }
  let blink = 1
  if (!still) for (const at of [1.2, 5.3, 5.65]) blink = Math.min(blink, blinkAt(seconds % 7.9, at))
  if (shapeChange) blink = Math.min(blink, blinkAt(local, 0, 0.48))
  const drift = still ? 0 : Math.sin(seconds * 1.3) * 0.35
  const orbit = !still && (animation === 'orbit' || (animation === 'auto' && scene.name === 'orbit'))
  const x = mix(previous.x, target.x, amount) + drift + (orbit ? Math.sin(seconds * 1.7) * 3 : 0) + (still ? 0 : clamp(interaction.gazeX || 0, -2, 2))
  const y = mix(previous.y, target.y, amount) + (orbit ? Math.cos(seconds * 1.7) * 2 : 0) + (still ? 0 : Math.sin(seconds * 0.9) * 0.2 + clamp(interaction.gazeY || 0, -1.5, 1.5))
  const tilt = mix(previous.tilt, target.tilt, amount)
  const eyeColor = (palette: number) => palette === 0 && interaction.dark ? [255, 255, 255] : interaction.dark ? palettes[palette]!.map(channel => Math.round(channel + (255 - channel) * 0.64)) : palettes[palette]!
  const a = eyeColor(previous.palette)
  const b = eyeColor(target.palette)
  const bodyAnimation = animation === 'auto' && ['jelly', 'wave', 'orbit', 'bounce', 'spin', 'greeting', 'excited'].includes(scene.name) ? scene.name as FlowAnimation : animation
  const gesture = animation === 'auto' && bodyAnimation !== 'auto' ? { animation: bodyAnimation, local, duration: scene.duration } : undefined
  const body = sampleFlowContour(seconds, interaction.contour, animation, gesture)
  return {
    expression: scene.name,
    body: body.path,
    bodyShape: body.shape,
    bodyTransform: body.transform,
    faceTransform: body.faceTransform,
    left: eyePath(left, 22, blink),
    right: eyePath(right, 42, blink),
    transform: `translate(${precision(x)} ${precision(y)}) rotate(${precision(tilt)} 32 32)`,
    ink: color(a, b, amount)
  }
}
