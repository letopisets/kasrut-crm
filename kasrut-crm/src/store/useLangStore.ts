// Compatibility shim — same API as Zustand useLangStore, backed by Redux
import { useAppSelector, useAppDispatch } from './index'
import { setLang as setLangAction, type Lang } from './langSlice'

export type { Lang }

interface LangShimState {
  lang:    Lang
  setLang: (lang: Lang) => void
}

export function useLangStore<T>(selector: (state: LangShimState) => T): T {
  const dispatch = useAppDispatch()
  const lang     = useAppSelector(s => s.lang.lang)

  const state: LangShimState = {
    lang,
    setLang: (l) => dispatch(setLangAction(l)),
  }

  return selector(state)
}
