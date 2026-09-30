import { describe, it, expect } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import authReducer, { logout, setUser } from '@/store/authSlice'
import { baseApi } from '@/store/api/baseApi'
import { rabbanutApi } from '@/store/api/rabbanutApi'
import { resetApiOnSessionChange } from '@/store/sessionReset'
import type { Rabbanut, User } from '@/types'

const owner: User = {
  id: 'u_owner', name: 'Owner', email: 'o@crm.il', role: 'owner', twoFactorEnabled: false,
}
const tenant: User = {
  id: 'u_rb', name: 'Tenant', email: 't@crm.il', role: 'rabbanut', rabbanutId: 'rb_a', twoFactorEnabled: false,
}
const allRabbanuts = [{ id: 'rb_a' }, { id: 'rb_b' }] as Rabbanut[]

function makeStore() {
  return configureStore({
    reducer: { auth: authReducer, [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware, resetApiOnSessionChange),
  })
}

type TestStore = ReturnType<typeof makeStore>

async function cacheAllRabbanuts(store: TestStore) {
  await store.dispatch(rabbanutApi.util.upsertQueryData('getRabbanuts', undefined, allRabbanuts))
  expect(Object.keys(store.getState().api.queries)).toHaveLength(1)
}

describe('resetApiOnSessionChange', () => {
  it('drops the previous account\'s cached lists on logout', async () => {
    const store = makeStore()
    store.dispatch(setUser({ user: owner, token: 't1' }))
    await cacheAllRabbanuts(store)

    store.dispatch(logout())
    expect(store.getState().api.queries).toEqual({})
  })

  it('drops them when another account signs in without a logout in between', async () => {
    const store = makeStore()
    store.dispatch(setUser({ user: owner, token: 't1' }))
    await cacheAllRabbanuts(store)

    store.dispatch(setUser({ user: tenant, token: 't2' }))
    expect(store.getState().api.queries).toEqual({})
  })

  it('keeps the cache when the same account is re-dispatched (2FA toggle, new token)', async () => {
    const store = makeStore()
    store.dispatch(setUser({ user: tenant, token: 't1' }))
    await cacheAllRabbanuts(store)

    store.dispatch(setUser({ user: { ...tenant, twoFactorEnabled: true }, token: 't2' }))
    expect(Object.keys(store.getState().api.queries)).toHaveLength(1)
  })
})
