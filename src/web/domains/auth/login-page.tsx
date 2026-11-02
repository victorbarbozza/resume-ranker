import { useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/web/components/button'
import { TextField } from '@/web/components/field'
import { AlertIcon } from '@/web/components/icons'
import { LanguageSelect } from '@/web/components/language-select'
import { useDocumentTitle } from '@/web/components/page'
import { describeError, toApiFailure } from '@/web/lib/api'

import styles from './login-page.module.css'
import { useLogin } from './queries'

/** What the login form holds */
type Credentials = { username: string; password: string }

/** A path inside the app to return to after signing in; anything else goes to the jobs */
const safeRedirect = (target: string | undefined) =>
  target?.startsWith('/') && !target.startsWith('//') ? target : '/jobs'

/**
 * Sign in. There is no sign-up: an administrator creates accounts. After
 * signing in, the person returns to the page that sent them here. A wrong
 * password clears the password field and puts the focus back on it.
 */
export function LoginPage({
  redirectTo,
  expired,
}: {
  redirectTo?: string
  expired: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const login = useLogin()
  const { register, handleSubmit, resetField, setFocus, formState } =
    useForm<Credentials>()
  useDocumentTitle(t('auth.title'))

  const submit = handleSubmit((credentials) =>
    login.mutate(credentials, {
      onSuccess: () => navigate({ href: safeRedirect(redirectTo) }),
      onError: (error) => {
        if (toApiFailure(error).code !== 'INVALID_CREDENTIALS') return
        resetField('password')
        setFocus('password')
      },
    })
  )

  return (
    <main className={styles.screen}>
      <div className={styles.language}>
        <LanguageSelect />
      </div>
      <div className={styles.column}>
        <div className={styles.titles}>
          <p className={styles.brand}>{t('common.appName')}</p>
          <h1 className={styles.title}>{t('auth.title')}</h1>
        </div>
        {expired && <p className={styles.notice}>{t('auth.expired')}</p>}
        <form className={styles.form} onSubmit={submit} noValidate>
          <TextField
            label={t('auth.username')}
            autoComplete="username"
            autoCapitalize="none"
            error={formState.errors.username?.message}
            {...register('username', { required: t('auth.usernameRequired') })}
          />
          <TextField
            label={t('auth.password')}
            type="password"
            autoComplete="current-password"
            error={formState.errors.password?.message}
            {...register('password', { required: t('auth.passwordRequired') })}
          />
          {login.error && (
            <p className={styles.error} role="alert">
              <AlertIcon size={18} />
              {describeError(login.error)}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            size="large"
            fullWidth
            loading={login.isPending}
          >
            {t('auth.submit')}
          </Button>
        </form>
        <p className={styles.footnote}>{t('auth.noAccount')}</p>
      </div>
    </main>
  )
}
