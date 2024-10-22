import { randomUUID } from 'crypto'

import { asTransaction } from '@backend/database/client.js'
import { AllowedSession as AllowedSessionSchema } from '@backend/database/schema/AllowedSession.js'
import { User as UserSchema } from '@backend/database/schema/User.js'

export default class AllowedSession {
  public static async fromSessionId(sessionId: AllowedSessionSchema['sessionId']) {
    const allowedSession = await asTransaction((queries) => queries.getAllowedSessionById(sessionId))
    if (allowedSession == null) {
      return null
    }
    return new AllowedSession(allowedSession)
  }

  public static createNewForUserId(userId: UserSchema['id']) {
    const newSessionId = AllowedSession.createSessionId()
    return new AllowedSession({
      user: userId,
      sessionId: newSessionId,
    })
  }

  public static async deleteAllSessionsForUserExecptOne(userId: UserSchema['id'], sessionId: AllowedSessionSchema['sessionId']) {
    await asTransaction((queries) => queries.deleteAllAllowedSessionForUserExceptOne(userId, sessionId))
  }

  private static createSessionId() {
    return randomUUID()
  }

  public get sessionId() {
    return this.allowedSession.sessionId
  }

  public async update(data: Partial<AllowedSessionSchema>) {
    this.allowedSession = {
      ...this.allowedSession,
      ...data,
    }
    await asTransaction((queries) => queries.insertOrUpdateAllowedSession(this.allowedSession))
  }

  public async delete() {
    await asTransaction((queries) => queries.deleteAllowedSession(this.allowedSession))
  }

  private allowedSession: AllowedSessionSchema
  private constructor(allowedSession: AllowedSessionSchema) {
    this.allowedSession = allowedSession
  }
}
