import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'
import superjson from 'superjson'

import { AppRouter as AuthRouter } from '@backend/domain/auth/trpc/index.js'
import axios, { AxiosResponse } from 'axios'
import { decodeJwt } from 'jose'

import { Set } from '@shared/data/api/Set.js'

import Frontend from './Frontend.js'
import { API_ORIGIN } from '../constants.js'

export default class FrontendWithAuth extends Frontend {
  authServiceLoginHash = ''
  accessToken = ''
  refreshToken = ''

  private trpcAuth

  constructor() {
    super()
    this.trpcAuth = createTRPCProxyClient<AuthRouter>({
      transformer: superjson,
      links: [
        httpBatchLink({
          url: `${API_ORIGIN}/auth/trpc`,
          maxURLLength: 2083,
          headers: async () => {
            return {
              Cookie: this.refreshToken ? `refresh_token=${this.refreshToken}` : '',
              Authorization: this.accessToken || '',
            }
          },
          fetch: async (url, options) => {
            const response = await fetch(url, options)
            this.setRefreshTokenFromFetchResponse(response)
            return response
          },
        }),
      ],
    })
  }

  clearLoginAndAuth() {
    this.authServiceLoginHash = ''
    this.accessToken = ''
    this.refreshToken = ''
  }

  async authCreate() {
    const response = await this.trpcAuth.lnurlAuth.create.query()
    this.authServiceLoginHash = response.hash
    return response
  }

  async authLoginWithLnurlAuthHash() {
    const response = await this.trpcAuth.auth.loginWithLnurlAuthHash.query({
      hash: this.authServiceLoginHash,
    })
    this.accessToken = response.accessToken
    return response
  }

  async authRefresh() {
    const response = await axios.get(`${API_ORIGIN}/api/auth/refresh`, this.getRefreshHeader())
    this.accessToken = response.data.data.accessToken
    this.setRefreshTokenFromAxiosResponse(response)
    return response
  }

  async logout() {
    await this.trpcAuth.auth.logout.query()
  }

  async logoutAllOtherDevices() {
    const response = await axios.post(`${API_ORIGIN}/api/auth/logoutAllOtherDevices`, {}, this.getRefreshHeader())
    this.setRefreshTokenFromAxiosResponse(response)
    return response
  }

  async loadSets() {
    return await axios.get(`${API_ORIGIN}/api/set/`, this.getAccessHeader())
  }

  async loadSet(setId: string) {
    return await axios.get(`${API_ORIGIN}/api/set/${setId}`, this.getAccessHeader())
  }

  async saveSet(set: Set) {
    return await axios.post(`${API_ORIGIN}/api/set/${set.id}`, set, this.getAccessHeader())
  }

  setRefreshTokenFromFetchResponse(response: Response) {
    const cookies = response.headers.get('set-cookie')
    if (typeof cookies === 'string') {
      this.setRefreshTokenFromCookies([cookies])
    }
  }

  setRefreshTokenFromAxiosResponse(response: AxiosResponse) {
    const cookies = response.headers['set-cookie']
    if (cookies === undefined) {
      throw new Error('no cookies set')
    }
    this.setRefreshTokenFromCookies(cookies)
  }

  setRefreshTokenFromCookies(cookies: string[]) {
    if (!cookies[0].includes('refresh_token')) {
      return
    }

    const match = cookies[0].match(/(^| )refresh_token=(?<refreshToken>[^;]+)/)
    if (match == null || match.groups == null) {
      this.refreshToken = ''
    } else {
      this.refreshToken = match.groups['refreshToken']
    }
  }

  getRefreshHeader() {
    if (this.refreshToken === '') { return {} }

    return {
      headers: {
        'Cookie': `refresh_token=${this.refreshToken}`,
      },
    }
  }

  getAccessHeader() {
    if (this.accessToken === '') { return {} }

    return {
      headers: {
        'Authorization': this.accessToken,
      },
    }
  }

  get userId() {
    if (this.accessToken === '') {
      return ''
    }
    const accessTokenPayload = decodeJwt<{ id: string }>(this.accessToken)
    return accessTokenPayload.id
  }
}
