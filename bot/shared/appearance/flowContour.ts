import { closedAvatarPath, precision, type AvatarPoint } from './avatarGeometry.js'
import type { FlowAnimation, FlowContour } from './flowStyle.js'

type Shape = Exclude<FlowContour, 'auto'>
const count = 96
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * x * (x * (x * 6 - 15) + 10)
}
const morphs: Shape[] = ['circle', 'squircle', 'triangle', 'drop', 'flower', 'capsule', 'diamond', 'cloud', 'star', 'circle']

function polygonRadius(angle: number, sides: number, rotation: number, radius: number) {
  const sector = Math.PI * 2 / sides
  const local = ((angle - rotation + Math.PI / sides) % sector + sector) % sector - Math.PI / sides
  return radius * Math.cos(Math.PI / sides) / Math.cos(local)
}

function radius(shape: Shape, angle: number) {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  if (shape === 'squircle') return 22.5 / (Math.abs(c) ** 3.8 + Math.abs(s) ** 3.8) ** (1 / 3.8)
  if (shape === 'triangle') return polygonRadius(angle, 3, Math.PI / 2, 31) * 0.82 + 23 * 0.18
  if (shape === 'drop') return 23 * (1 + 0.22 * s + 0.08 * Math.cos(2 * angle))
  if (shape === 'flower') return 23 * (1 + 0.13 * Math.cos(5 * angle - Math.PI / 2))
  if (shape === 'capsule') return 1 / Math.sqrt((c / 28) ** 2 + (s / 19) ** 2)
  if (shape === 'diamond') return 27 / (Math.abs(c) ** 1.65 + Math.abs(s) ** 1.65) ** (1 / 1.65)
  if (shape === 'cloud') return 23.5 * (1 + 0.1 * Math.cos(3 * angle + 0.8) + 0.04 * Math.sin(5 * angle))
  if (shape === 'star') return 23 * (1 + 0.15 * Math.cos(5 * (angle + Math.PI / 2)))
  return 25.5
}

// Corresponding radial samples make every contour pair continuously morphable.
// Round polygon corners once, outside the render loop, so no constraint solver jitters.
const profiles = Object.fromEntries(morphs.map((shape) => {
  let rounded = Array.from({ length: count }, (_, i) => radius(shape, i * Math.PI * 2 / count - Math.PI / 2))
  for (let pass = 0; pass < 3; pass++) {
    const previous = rounded
    rounded = previous.map((r, i) => (
      previous[(i + count - 4) % count]! + 4 * previous[(i + count - 2) % count]!
      + 6 * r + 4 * previous[(i + 2) % count]! + previous[(i + 4) % count]!
    ) / 16)
  }
  return [shape, rounded]
})) as Record<Shape, number[]>
const faceFit: Record<Shape, [number, number]> = {
  circle: [0.94, 0], squircle: [0.94, 0], triangle: [0.76, 4.1], drop: [0.83, 2],
  flower: [0.83, 0], capsule: [0.83, 0], diamond: [0.77, 0], cloud: [0.84, 0.5], star: [0.76, 0]
}

export function sampleFlowContour(seconds: number, contour: FlowContour = 'auto', animation: FlowAnimation = 'auto', gesture?: { animation: FlowAnimation, local: number, duration: number }) {
  const still = animation === 'still'
  const t = still ? 0 : seconds
  const movement = gesture?.animation || animation
  const motionTime = gesture?.local ?? t
  const envelope = gesture ? smooth(gesture.local / 0.45) * smooth((gesture.duration - gesture.local) / 0.45) : 1
  const speed = animation === 'morph' ? 1.45 : animation === 'spin' ? 1.2 : 1
  const timeline = t * speed / 3.1
  const block = Math.floor(timeline) % morphs.length
  const phase = timeline - Math.floor(timeline)
  const from = contour === 'auto' ? morphs[(block + morphs.length - 1) % morphs.length]! : contour
  const to = contour === 'auto' ? morphs[block]! : contour
  const blend = smooth(phase * 3.1 / 0.92)
  const a = profiles[from]
  const b = profiles[to]
  let scaleX = 1
  let scaleY = 1
  let rotation = 0
  let y = 0
  let amplitude = 0.018
  if (movement === 'jelly') {
    scaleX = 1 + Math.sin(motionTime * 3.7) * 0.11
    scaleY = 1 / scaleX
    rotation = Math.sin(motionTime * 1.85) * 5
    amplitude = 0.045
  } else if (movement === 'wave') {
    amplitude = 0.075
    rotation = Math.sin(motionTime * 1.1) * 4
  } else if (movement === 'bounce' || movement === 'excited') {
    const p = motionTime * (movement === 'excited' ? 4.5 : 2.7)
    y = -Math.abs(Math.sin(p)) * 3.2
    scaleX = 1 + Math.cos(p * 2) * 0.055
    scaleY = 1 / scaleX
    rotation = movement === 'excited' ? Math.sin(p) * 9 : 0
  } else if (movement === 'spin') {
    const spinTime = motionTime % 5.6
    rotation = spinTime < 1.25 ? smooth(spinTime / 1.25) * 360 : 0
    amplitude = 0.035
  } else if (movement === 'greeting') {
    rotation = Math.sin(motionTime * 2.6) * 13
    y = Math.sin(motionTime * 5.2) * 0.8
  } else if (movement === 'orbit') {
    rotation = Math.sin(motionTime * 1.7) * 8
  } else if (movement === 'morph') {
    amplitude = 0.04
  }
  scaleX = mix(1, scaleX, envelope)
  scaleY = mix(1, scaleY, envelope)
  rotation *= envelope
  y *= envelope
  amplitude = mix(0.018, amplitude, envelope)
  const breath = still ? 1 : 1 + Math.sin(t * 1.55) * 0.012
  const radii = a.map((r, i) => {
    const angle = i * Math.PI * 2 / count - Math.PI / 2
    const ripple = still ? 0 : amplitude * (0.65 * Math.sin(3 * angle + t * 2.1) + 0.35 * Math.cos(4 * angle - t * 1.7))
    const animatedRadius = mix(r, b[i]!, blend) * (breath + ripple)
    return animatedRadius > 27 ? 27 + 1.5 * Math.tanh((animatedRadius - 27) / 1.5) : animatedRadius
  })
  const path = closedAvatarPath(radii.map((r, i): AvatarPoint => {
    const angle = i * Math.PI * 2 / count - Math.PI / 2
    return [32 + r * Math.cos(angle), 32 + r * Math.sin(angle)]
  }))
  const fit = mix(faceFit[from][0], faceFit[to][0], blend)
  const faceY = mix(faceFit[from][1], faceFit[to][1], blend)
  return {
    path,
    shape: to,
    transform: `translate(32 ${precision(32 + y)}) rotate(${precision(rotation)}) scale(${precision(scaleX)} ${precision(scaleY)}) translate(-32 -32)`,
    faceTransform: `translate(32 ${precision(32 + faceY)}) scale(${precision(fit)}) translate(-32 -32)`
  }
}
