import type { FoodType, KashrutLevel } from '@/types'

export const PRIMARY = '#E8A507'

export const FOOD_TYPE_COLOR: Record<FoodType, string> = {
  meat:     '#E74C3C',
  dairy:    '#3498DB',
  pareve:   '#2ECC71',
  takeaway: '#E8A507',
}

export const FOOD_TYPE_EMOJI: Record<FoodType, string> = {
  meat:     '🥩',
  dairy:    '🧀',
  pareve:   '🐟',
  takeaway: '🥡',
}

export const KASHRUT_COLOR: Record<KashrutLevel, string> = {
  mehadrin: '#9B59B6',
  badatz:   '#E74C3C',
  regular:  '#3498DB',
}

// Values only — labels come from translations (radiusLabels array, same order)
export const RADIUS_VALUES: (number | null)[] = [500, 1000, 2000, 5000, 10000, 20000, null]

export const DEFAULT_CENTER: [number, number] = [31.7767, 35.2345]  // Jerusalem
export const DEFAULT_ZOOM = 14
