import { z } from 'zod'

import { PermissionsEnum } from '@shared/data/auth/User.js'

import { asTransaction } from '@backend/database/client.js'
import { User as UserSchema } from '@backend/database/schema/User.js'
import hashSha256 from '@backend/services/hashSha256.js'

export default class User {
  public static async fromLnurlAuthKey(walletLinkingKey: UserSchema['lnurlAuthKey']) {
    const user = await asTransaction(async (queries) => queries.getUserByLnurlAuthKey(walletLinkingKey))
    if (user == null) {
      return null
    }
    return new User(user)
  }

  public static async fromId(id: UserSchema['id']) {
    const user = await asTransaction(async (queries) => queries.getUserById(id))
    if (user == null) {
      return null
    }
    return new User(user)
  }

  public static newUserFromWalletLinkingKey(walletLinkingKey: UserSchema['lnurlAuthKey']) {
    const newUserId = this.createUserId(walletLinkingKey)
    return new User({
      id: newUserId,
      lnurlAuthKey: walletLinkingKey,
      created: new Date(),
      permissions: [],
    })
  }

  private static createUserId(walletLinkingKey: UserSchema['lnurlAuthKey']) {
    return hashSha256(walletLinkingKey)
  }

  get id() {
    return this.user.id
  }

  get lnurlAuthKey() {
    return this.user.lnurlAuthKey
  }

  get permissions() {
    return this.transformPermissions()
  }

  public async update(data: Partial<UserSchema>) {
    this.user = {
      ...this.user,
      ...data,
    }
    await asTransaction((queries) => queries.insertOrUpdateUser(this.user))
  }

  private user: UserSchema
  private constructor(user: UserSchema) {
    this.user = user
    this.validatePermissions()
  }

  private validatePermissions() {
    z.array(PermissionsEnum).parse(this.user.permissions)
  }

  private transformPermissions() {
    return z.array(PermissionsEnum).parse(this.user.permissions)
  }
}
