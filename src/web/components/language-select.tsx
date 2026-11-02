import { useTranslation } from 'react-i18next'

import { LANGUAGE_NAMES, LANGUAGES, setLanguage } from '@/web/i18n'

import { GlobeIcon } from './icons'
import { Select } from './select'

/** Chooses the language of the screen; each one is named in itself */
export function LanguageSelect() {
  const { t, i18n } = useTranslation()
  return (
    <Select
      variant="quiet"
      label={t('common.language')}
      icon={<GlobeIcon size={16} />}
      value={
        LANGUAGES.find((language) => language === i18n.language) ?? 'en-US'
      }
      choices={LANGUAGES.map((language) => ({
        value: language,
        label: LANGUAGE_NAMES[language],
        lang: language,
      }))}
      onChange={setLanguage}
    />
  )
}
