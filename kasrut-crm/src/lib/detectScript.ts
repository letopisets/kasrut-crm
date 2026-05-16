export type InputScript = 'he' | 'ru' | 'en' | 'unknown'

const RE_HE  = /[֐-׿]/
const RE_RU  = /[Ѐ-ӿ]/
const RE_EN  = /[a-zA-Z]/

// Count characters matching a pattern (ignores spaces/digits/punctuation)
function countMatches(text: string, re: RegExp): number {
  return (text.match(new RegExp(re.source, 'g')) ?? []).length
}

/**
 * Detects the dominant Unicode script in a string.
 * Returns 'unknown' for empty/digit-only input.
 *
 * Hebrew (U+0590–U+05FF), Cyrillic (U+0400–U+04FF), and Latin
 * are completely disjoint — detection is deterministic from the first char.
 */
export function detectScript(text: string): InputScript {
  if (!text) return 'unknown'

  const he = countMatches(text, RE_HE)
  const ru = countMatches(text, RE_RU)
  const en = countMatches(text, RE_EN)
  const total = he + ru + en

  if (total === 0) return 'unknown'

  // Whichever script has the majority wins
  if (he >= ru && he >= en) return 'he'
  if (ru >= he && ru >= en) return 'ru'
  return 'en'
}

/**
 * Maps an InputScript to the Settlement field name to display.
 */
export function scriptToNameField(script: InputScript): 'nameHe' | 'nameEn' | 'nameRu' {
  if (script === 'ru') return 'nameRu'
  if (script === 'en') return 'nameEn'
  return 'nameHe'
}
