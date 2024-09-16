import '@backend/initEnv.js' // Info: .env needs to read before imports

import '../../../lib/mocks/lnurl.js'
import '../../../lib/mocks/socketIo.js'
import '../../../lib/mocks/http.js'

import { describe, it, expect, vi } from 'vitest'
import http from 'http'
import { Request, Response } from 'express'

import { createCallerFactory } from '@backend/domain/auth/trpc/trpc.js'

import '../../lib/initAxios.js'
import { authRouter } from '@backend/domain/auth/trpc/router/auth.js'
import SocketIoServer from '@backend/domain/auth/services/SocketIoServer.js'
import Auth from '@backend/domain/auth/Auth.js'
import LnurlServer from '@backend/domain/auth/services/LnurlServer.js'
import LnurlAuthLogin from '@backend/domain/auth/LnurlAuthLogin.js'
import AuthSession from '@backend/domain/auth/AuthSession.js'

const createCaller = createCallerFactory(authRouter)

describe('TRpc Router Auth', () => {
  const mockRequest = {
    cookie: vi.fn(),
  } as unknown as Request
  const mockResponse = {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response

  const server = new http.Server()
  LnurlServer.init()
  SocketIoServer.init(server)
  Auth.init()

  const authSession = new AuthSession(mockRequest, mockResponse)

  const caller = createCaller({
    auth: Auth.getAuth(),
    session: authSession,
  })

  it('should login the user', async () => {
    const accessToken = 'mockAccessToken'
    const refreshToken = 'mockRefreshToken'
    const secret = 'mockSecret'
    const hash = LnurlAuthLogin.createHashFromSecret(secret)
    vi.spyOn(Auth.getAuth(), 'loginWithLnurlAuthHash').mockResolvedValueOnce({
      accessToken,
      refreshToken,
    })

    const loginResult = await caller.loginWithLnurlAuthHash({
      hash,
    })

    expect(loginResult.accessToken).toBe(accessToken)
  })

  it('should logout the user ', async () => {
    vi.spyOn(authSession, 'logout')
    vi.spyOn(mockResponse, 'clearCookie')

    await caller.logout()

    expect(authSession.logout).toHaveBeenCalled()
    expect(mockResponse.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      {
        httpOnly: true,
        sameSite: 'none',
        secure: true,
      },
    )
  })
})
