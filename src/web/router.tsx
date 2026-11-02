import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router'

import { AppShell } from '@/web/components/app-shell'
import { LoginPage } from '@/web/domains/auth/login-page'
import { meQuery } from '@/web/domains/auth/queries'
import { CandidatesPage } from '@/web/domains/candidates/candidates-page'
import { ResultPage } from '@/web/domains/evaluations/result-page'
import { JobPage } from '@/web/domains/jobs/job-page'
import { JobsPage } from '@/web/domains/jobs/jobs-page'
import { queryClient } from '@/web/lib/query-client'

/** The root: every screen renders inside it */
const rootRoute = createRootRoute({ component: Outlet })

/** /login, with the page to return to as `?redirect=`, and `?expired=1` when a session ended on an open screen */
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (
    search: Record<string, unknown>
  ): { redirect?: string; expired?: boolean } => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
    expired: search.expired === 1 || search.expired === '1' || undefined,
  }),
  component: function LoginRoute() {
    const { redirect: redirectTo, expired } = loginRoute.useSearch()
    return <LoginPage redirectTo={redirectTo} expired={expired === true} />
  },
})

/**
 * Every signed-in screen. Before any of them opens, the guard asks who is
 * signed in; nobody sends the visit to /login, back here afterwards. The guard
 * only improves navigation: the API checks the session on every request.
 */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'signed-in',
  beforeLoad: async ({ location }) => {
    try {
      await queryClient.ensureQueryData(meQuery)
    } catch {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
  },
  component: AppShell,
})

/** / opens the jobs */
const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/jobs' })
  },
})

/** /jobs */
const jobsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/jobs',
  component: JobsPage,
})

/** /jobs/:jobId, the job and its ranking */
const jobRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/jobs/$jobId',
  component: function JobRoute() {
    const { jobId } = jobRoute.useParams()
    return <JobPage jobId={jobId} />
  },
})

/** /jobs/:jobId/results/:candidateId, one result on its own screen, as a phone opens it */
const resultRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/jobs/$jobId/results/$candidateId',
  component: function ResultRoute() {
    const { jobId, candidateId } = resultRoute.useParams()
    return <ResultPage jobId={jobId} candidateId={candidateId} />
  },
})

/** /candidates */
const candidatesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/candidates',
  component: CandidatesPage,
})

/** Every screen of the app, declared in one place */
const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    indexRoute,
    jobsRoute,
    jobRoute,
    resultRoute,
    candidatesRoute,
  ]),
])

/** The router; each route's paths and params are typed from the tree above */
export const router = createRouter({ routeTree, defaultPreload: 'intent' })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
