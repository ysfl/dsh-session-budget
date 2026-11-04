import { createContext, useContext, type ReactElement, type ReactNode } from 'react'
import { zh, type LocaleKey } from './locales.ts'

export type LocaleId = 'zh' | 'en'
export type Translate = (key: LocaleKey, params?: Record<string, unknown>) => string

export const fallbackT: Translate = (key, params) => {
  const template = zh[key]
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match)
}

const TranslationContext = createContext<Translate>(fallbackT)

export function LocaleProvider(props: { t: Translate; children: ReactNode }): ReactElement {
  return <TranslationContext.Provider value={props.t}>{props.children}</TranslationContext.Provider>
}

export function useI18n(): { t: Translate; locale: LocaleId } {
  const t = useContext(TranslationContext)
  return { t, locale: t('meta.locale') === 'en' ? 'en' : 'zh' }
}
