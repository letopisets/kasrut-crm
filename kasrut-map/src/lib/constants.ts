import type { FoodType, KashrutLevel } from '@/types'

export const PRIMARY = '#E8A507'

export const FOOD_TYPE_LABEL: Record<FoodType, string> = {
  meat:     'Мясной',
  dairy:    'Молочный',
  pareve:   'Паревэ',
  takeaway: 'На вынос',
}

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

export const KASHRUT_LABEL: Record<KashrutLevel, string> = {
  mehadrin: 'Mehadrin',
  badatz:   "Badatz",
  regular:  'Regular',
}

export const KASHRUT_COLOR: Record<KashrutLevel, string> = {
  mehadrin: '#9B59B6',
  badatz:   '#E74C3C',
  regular:  '#3498DB',
}

export const RADIUS_OPTIONS: { label: string; value: number | null }[] = [
  { label: '500 м',  value: 500    },
  { label: '1 км',   value: 1000   },
  { label: '2 км',   value: 2000   },
  { label: '5 км',   value: 5000   },
  { label: '10 км',  value: 10000  },
  { label: '20 км',  value: 20000  },
  { label: 'Все',    value: null   },
]

export const DEFAULT_CENTER: [number, number] = [31.7767, 35.2345]  // Jerusalem
export const DEFAULT_ZOOM = 14
