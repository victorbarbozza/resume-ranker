import { useQuery } from '@tanstack/react-query'
import { Link, Outlet, useLocation } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { meQuery, useLogout } from '@/web/domains/auth/queries'
import { jobsQuery } from '@/web/domains/jobs/queries'

import styles from './app-shell.module.css'
import { CandidatesIcon, JobsIcon, PulseIcon } from './icons'
import { LanguageSelect } from './language-select'
import { Tag } from './status'

/** Screens with a tab of their own, where the phone shows the account button */
const TOP_LEVEL_PATHS = ['/jobs', '/candidates']

/**
 * Every signed-in screen: the sections on a translucent sidebar, which becomes
 * a tab bar on a phone, and the account with the language and Sign out.
 * Observability is planned, so the sidebar shows it without opening it and
 * the phone leaves it out.
 */
export function AppShell() {
  const { t } = useTranslation()
  const { data: me } = useQuery(meQuery)
  const { data: jobs } = useQuery(jobsQuery)
  const logout = useLogout()
  const { pathname } = useLocation()

  const signOut = () => logout.mutate()
  const username = me?.username ?? ''
  const initial = username.charAt(0)

  return (
    <div className={styles.shell}>
      <nav aria-label={t('common.sections')} className={styles.sidebar}>
        <p className={styles.brand}>{t('common.appName')}</p>
        <Link to="/jobs" className={styles.item}>
          <JobsIcon />
          <span className={styles.itemLabel}>{t('common.jobs')}</span>
          <span className={styles.count}>{jobs?.jobs.length}</span>
        </Link>
        <Link to="/candidates" className={styles.item}>
          <CandidatesIcon />
          <span className={styles.itemLabel}>{t('common.candidates')}</span>
        </Link>
        <span
          className={`${styles.item} ${styles.disabled}`}
          aria-disabled="true"
        >
          <PulseIcon />
          <span className={styles.itemLabel}>{t('common.observability')}</span>
          <Tag tone="planned">{t('common.planned')}</Tag>
        </span>
        <span className={styles.spacer} />
        <div className={styles.language}>
          <LanguageSelect />
        </div>
        <div className={styles.account}>
          <span className={styles.avatar} aria-hidden="true">
            {initial}
          </span>
          <span className={styles.username}>{username}</span>
          <button type="button" className={styles.signOut} onClick={signOut}>
            {t('common.signOut')}
          </button>
        </div>
      </nav>

      <div className={styles.content}>
        {TOP_LEVEL_PATHS.includes(pathname) && (
          <div className={styles.phoneBar}>
            <button
              type="button"
              className={styles.accountButton}
              popoverTarget="account-menu"
              aria-label={t('common.account', { name: username })}
            >
              <span className={styles.avatar} aria-hidden="true">
                {initial}
              </span>
            </button>
            <div id="account-menu" popover="auto" className={styles.menu}>
              <p className={styles.menuHead}>
                {t('common.signedInAs', { name: username })}
              </p>
              <div className={styles.menuLanguage}>
                <LanguageSelect />
              </div>
              <button
                type="button"
                className={styles.menuItem}
                onClick={signOut}
              >
                {t('common.signOut')}
              </button>
            </div>
          </div>
        )}
        <Outlet />
      </div>
    </div>
  )
}
