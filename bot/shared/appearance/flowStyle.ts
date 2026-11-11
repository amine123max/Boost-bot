export const flowAnimations = [
  { value: 'auto', label: '全部表情' },
  { value: 'natural', label: '自然眨眼' },
  { value: 'curious', label: '灵动张望' },
  { value: 'playful', label: '俏皮眨眼' },
  { value: 'hearts', label: '爱心眼' },
  { value: 'sparkles', label: '星星眼' },
  { value: 'sleepy', label: '慵懒半闭眼' },
  { value: 'morph', label: '流体变形' },
  { value: 'jelly', label: '果冻弹动' },
  { value: 'wave', label: '水波律动' },
  { value: 'orbit', label: '环游张望' },
  { value: 'bounce', label: '轻盈跳跃' },
  { value: 'spin', label: '旋转变身' },
  { value: 'greeting', label: '歪头招呼' },
  { value: 'excited', label: '雀跃欢笑' },
  { value: 'still', label: '静态' }
] as const

export const flowContours = [
  { value: 'auto', label: '轮廓自动变换' },
  { value: 'circle', label: '圆形' },
  { value: 'squircle', label: '圆角方形' },
  { value: 'triangle', label: '圆润三角' },
  { value: 'drop', label: '水滴' },
  { value: 'flower', label: '花瓣' },
  { value: 'capsule', label: '胶囊' },
  { value: 'diamond', label: '软菱形' },
  { value: 'cloud', label: '云朵' },
  { value: 'star', label: '圆角星形' }
] as const

export const flowPalettes = [
  { value: 'adaptive', label: '黑白自适应', light: '#111113', dark: '#ffffff' },
  { value: 'cycle', label: '自动配色', light: '#7c3aed', dark: '#c4b5fd' },
  { value: 'emerald', label: '翡翠绿', light: '#047857', dark: '#6ee7b7' },
  { value: 'blue', label: '蓝色', light: '#2563eb', dark: '#93c5fd' },
  { value: 'violet', label: '紫罗兰', light: '#7c3aed', dark: '#c4b5fd' },
  { value: 'cyan', label: '青色', light: '#0e7490', dark: '#67e8f9' },
  { value: 'rose', label: '玫瑰红', light: '#be185d', dark: '#f9a8d4' },
  { value: 'amber', label: '琥珀', light: '#b45309', dark: '#fcd34d' },
  { value: 'orange', label: '橙色', light: '#c2410c', dark: '#fdba74' },
  { value: 'custom', label: '自定义颜色', light: '#2563eb', dark: '#2563eb' }
] as const

export type FlowAnimation = typeof flowAnimations[number]['value']
export type FlowPalette = typeof flowPalettes[number]['value']
export type FlowContour = typeof flowContours[number]['value']
