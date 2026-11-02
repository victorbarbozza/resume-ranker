import { queryOptions, useMutation } from '@tanstack/react-query'
import { parseResponse } from 'hono/client'

import { client } from '@/web/lib/api'
import { queryClient } from '@/web/lib/query-client'

/** The signed-in person; a 401 here means nobody is, which the route guard turns into the login page */
export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: () => parseResponse(client.api.auth.me.$get()),
  staleTime: Infinity,
})

/** Signs in and remembers who, so the guard lets the next page through without asking again */
export const useLogin = () =>
  useMutation({
    mutationFn: (credentials: { username: string; password: string }) =>
      parseResponse(client.api.auth.login.$post({ json: credentials })),
    onSuccess: (user) => queryClient.setQueryData(meQuery.queryKey, user),
  })

/**
 * Signs out, then loads the login page afresh, so nothing the screen had
 * read or was sending stays in memory, and no open screen asks the API again
 * without a session.
 */
export const useLogout = () =>
  useMutation({
    mutationFn: () => parseResponse(client.api.auth.logout.$post()),
    onSettled: () => location.assign('/login'),
  })
