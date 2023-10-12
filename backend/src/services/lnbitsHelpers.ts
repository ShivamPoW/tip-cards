import axios from 'axios'
import z from 'zod'

import { getCardByHash, createCard, updateCard, updateSet } from './database'
import hashSha256 from './hashSha256'
import { TIPCARDS_API_ORIGIN, LNBITS_INVOICE_READ_KEY, LNBITS_ADMIN_KEY, LNBITS_ORIGIN } from '../constants'

import { Card as ZodCardApi, type Card as CardApi } from '../../../src/data/api/Card'
import type { BulkWithdraw } from '../../../src/data/redis/BulkWithdraw'
import type { Set } from '../../../src/data/redis/Set'
import { cardRedisFromCardApi } from '../../../src/data/transforms/cardRedisFromCardApi'
import { ErrorWithCode, ErrorCode } from '../../../src/data/Errors'

/**
 * Checks if the card invoice has been paid.
 * 
 * Side-effects:
 *  - manipulates the given card
 *  - updates the card in the database
 * 
 * @param card CardApi
 * @throws ErrorWithCode
 */
export const checkIfCardInvoiceIsPaid = async (card: CardApi): Promise<CardApi> => {
  if (card.isLockedByBulkWithdraw) {
    return card
  }

  if (
    card.lnbitsWithdrawId != null
    || card.invoice == null
    || card.invoice.paid != null
  ) {
    return card
  }
  try {
    const response = await axios.get(`${LNBITS_ORIGIN}/api/v1/payments/${card.invoice.payment_hash}`, {
      headers: {
        'Content-type': 'application/json',
        'X-Api-Key': LNBITS_INVOICE_READ_KEY,
      },
    })
    if (typeof response.data.paid !== 'boolean') {
      throw new ErrorWithCode('Missing paid status when checking invoice status at lnbits.', ErrorCode.UnableToGetLnbitsInvoiceStatus)
    }
    if (response.data.paid === true) {
      card.invoice.paid = Math.round(+ new Date() / 1000)
    }
  } catch (error) {
    // if the invoice doesnt exist anymore handle the expired invoice in the frontend
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        card.invoice.expired = true
        return card
      }
    }
    throw new ErrorWithCode(error, ErrorCode.UnableToGetLnbitsInvoiceStatus)
  }
  try {
    await updateCard(cardRedisFromCardApi(card))
  } catch (error) {
    throw new ErrorWithCode(error, ErrorCode.UnknownDatabaseError)
  }
  return card
}

/**
 * Checks if the card lnurlp has been paid.
 * 
 * Side-effects:
 *  - manipulates the given card
 *  - updates the card in the database
 * 
 * @param card CardApi
 * @throws ErrorWithCode
 */
export const checkIfCardLnurlpIsPaid = async (card: CardApi, closeShared = false): Promise<CardApi> => {
  if (card.isLockedByBulkWithdraw) {
    return card
  }

  if (
    card.lnbitsWithdrawId != null
    || card.lnurlp == null
    || card.lnurlp.paid != null
  ) {
    return card
  }

  // 1. check if payment requests were created
  let servedPaymentRequests: number
  try {
    const response = await axios.get(`${LNBITS_ORIGIN}/lnurlp/api/v1/links/${card.lnurlp.id}`, {
      headers: {
        'Content-type': 'application/json',
        'X-Api-Key': LNBITS_ADMIN_KEY,
      },
    })
    if (response.data.served_pr === 0) {
      return card
    }
    servedPaymentRequests = response.data.served_pr
  } catch (error) {
    // if the pay link doesnt exist anymore handle the expired lnurlp in the frontend
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        card.lnurlp.expired = true
        return card
      }
    }
    throw new ErrorWithCode(error, ErrorCode.UnableToGetLnbitsLnurlpStatus)
  }
  // 1.a remove the payments that are already registered
  if (card.lnurlp.payment_hash != null) {
    servedPaymentRequests -= card.lnurlp.payment_hash.length
  }

  // 2. query payment requests for lnurlp
  const paymentRequests: string[] = []
  const limit = 500
  let offset = 0
  while (paymentRequests.length < servedPaymentRequests) {
    try {
      const response = await axios.get(`${LNBITS_ORIGIN}/api/v1/payments?limit=${limit}&offset=${offset}&sortby=time&direction=desc`, {
        headers: {
          'Content-type': 'application/json',
          'X-Api-Key': LNBITS_ADMIN_KEY,
        },
      })
      if (!Array.isArray(response.data)) {
        console.error(ErrorCode.LnbitsPaymentRequestsMalformedResponse, card.cardHash, response.data)
        break
      }
      if (response.data.length === 0) {
        // if invoices are expired they get removed by lnbits/lnd garbage collection
        // https://gitlab.satoshiengineering.com/satoshiengineering/projects/-/issues/664#note_10306
        break
      }
      const paymentsOlderThanLnurlp = response.data.some((payment) => {
        // invoices are older than the lnurlp, we can stop looking
        if (card.lnurlp?.created != null && card.lnurlp.created > payment.created) {
          return true
        }
        // check if the payment belongs to the lnurlp link
        if (
          payment.extra.tag !== 'lnurlp'
          || card.lnurlp?.id == null
          || String(payment.extra.link) !== String(card.lnurlp?.id)
        ) {
          return false
        }
        // do not add payments that are already recorded
        if (card.lnurlp?.payment_hash != null && card.lnurlp.payment_hash.includes(payment.payment_hash)) {
          return false
        }
        paymentRequests.push(payment.payment_hash)
      })
      if (paymentsOlderThanLnurlp) {
        break
      }
    } catch (error) {
      throw new ErrorWithCode(error, ErrorCode.UnableToGetLnbitsPaymentRequests)
    }
    offset += limit
  }

  // 3. check if a payment request was paid
  let amount = card.lnurlp?.amount != null ? card.lnurlp.amount : 0
  const payment_hash: string[] = card.lnurlp?.payment_hash != null ? card.lnurlp.payment_hash : []
  while (paymentRequests.length > 0) {
    const paymentRequest = paymentRequests.shift()
    if (paymentRequest == null) {
      break
    }
    try {
      const response = await axios.get(`${LNBITS_ORIGIN}/api/v1/payments/${paymentRequest}`, {
        headers: {
          'Content-type': 'application/json',
          'X-Api-Key': LNBITS_ADMIN_KEY,
        },
      })
      if (response.data.paid === true) {
        amount += Math.round(response.data.details.amount / 1000)
        payment_hash.push(response.data.details.payment_hash)
      }
    } catch (error) {
      throw new ErrorWithCode(error, ErrorCode.UnableToGetLnbitsInvoiceStatus)
    }
  }
  if (amount > 0) {
    card.lnurlp.amount = amount
    card.lnurlp.payment_hash = payment_hash

    if (!card.lnurlp.shared || closeShared) {
      card.lnurlp.paid = Math.round(+ new Date() / 1000)
    }
  }

  try {
    await updateCard(cardRedisFromCardApi(card))
  } catch (error) {
    throw new ErrorWithCode(error, ErrorCode.UnknownDatabaseError)
  }
  return card
}

/**
 * Checks if the card invoice has been funded (via invoice or lnurlp). If so, creates a withdraw link at lnbits.
 * Side-effects:
 *  - manipulates the given card
 *  - updates the card in the database
 * 
 * @param card CardApi
 * @throws ErrorWithCode
 */
export const checkIfCardIsPaidAndCreateWithdrawId = async (card: CardApi): Promise<CardApi> => {
  if (card.isLockedByBulkWithdraw) {
    return card
  }

  await checkIfCardInvoiceIsPaid(card)
  if (card.invoice?.paid == null) {
    await checkIfCardLnurlpIsPaid(card)
  }

  let amount: number | undefined = undefined
  if (card.invoice?.paid != null) {
    amount = card.invoice.amount
  } else if (card.lnurlp?.paid != null && card.lnurlp.amount != null) {
    amount = card.lnurlp.amount
  } else if (card.setFunding?.paid != null) {
    amount = card.setFunding.amount
  }
  if (amount == null) {
    return card
  }
  try {
    const response = await axios.post(`${LNBITS_ORIGIN}/withdraw/api/v1/links`, {
      title: card.text,
      min_withdrawable: amount,
      max_withdrawable: amount,
      uses: 1,
      wait_time: 1,
      is_unique: true,
      webhook_url: `${TIPCARDS_API_ORIGIN}/api/withdraw/used/${card.cardHash}`,
    }, {
      headers: {
        'Content-type': 'application/json',
        'X-Api-Key': LNBITS_ADMIN_KEY,
      },
    })
    if (typeof response.data.id === 'string' || typeof response.data.id === 'number') {
      card.lnbitsWithdrawId = String(response.data.id)
    } else {
      throw new ErrorWithCode('Missing withdrawId after creating withdraw link at lnbits.', ErrorCode.UnableToCreateLnbitsWithdrawLink)
    }
  } catch (error) {
    throw new ErrorWithCode(error, ErrorCode.UnableToCreateLnbitsWithdrawLink)
  }

  // remove lnurlp as soon as withdraw link is created to avoid paying more sats into a card that cannot be funded anymore
  if (card.lnurlp?.id != null) {
    try {
      await axios.delete(`${LNBITS_ORIGIN}/lnurlp/api/v1/links/${card.lnurlp.id}`, {
        headers: {
          'Content-type': 'application/json',
          'X-Api-Key': LNBITS_ADMIN_KEY,
        },
      })
    } catch (error) {
      // if the delete request returns 404 and has data, then the lnurlp has already been deleted (probably by lnbits)
      if (
        !axios.isAxiosError(error)
        || error.response?.status !== 404
        || error.response?.data === null
      ) {
        console.error(ErrorCode.UnableToRemoveLnurlpLink, error)
      }
    }
  }

  try {
    await updateCard(cardRedisFromCardApi(card))
  } catch (error) {
    throw new ErrorWithCode(error, ErrorCode.UnknownDatabaseError)
  }
  return card
}

/**
 * Checks if the card has been used.
 * 
 * Side-effects:
 *  - manipulates the given card
 *  - updates the card in the database
 * 
 * @param card CardApi
 * @param persist Bool
 * @throws ErrorWithCode
 */
export const checkIfCardIsUsed = async (card: CardApi, persist = false): Promise<CardApi> => {
  if (
    card.lnbitsWithdrawId == null
    || card.used != null
    || card.isLockedByBulkWithdraw
  ) {
    return card
  }
  try {
    const response = await axios.get(`${LNBITS_ORIGIN}/withdraw/api/v1/links/${card.lnbitsWithdrawId}`, {
      headers: {
        'Content-type': 'application/json',
        'X-Api-Key': LNBITS_INVOICE_READ_KEY,
      },
    })
    if (typeof response.data.used !== 'number') {
      throw new ErrorWithCode('Missing used count when checking withdraw status at lnbits.', ErrorCode.UnableToGetLnbitsWithdrawStatus)
    }
    if (response.data.used > 0) {
      if (persist) {
        card.used = Math.round(+ new Date() / 1000)
      } else {
        card.withdrawPending = true
      }
    }
  } catch (error) {
    throw new ErrorWithCode(error, ErrorCode.UnableToGetLnbitsWithdrawStatus)
  }
  if (card.used == null || !persist) {
    return card
  }

  try {
    await updateCard(cardRedisFromCardApi(card))
  } catch (error) {
    throw new ErrorWithCode(error, ErrorCode.UnknownDatabaseError)
  }
  return card
}

/**
 * Checks if the card has been used.
 * 
 * @param card CardApi
 * @throws
 */
export const getCardIsUsedFromLnbits = async (card: CardApi): Promise<boolean> => {
  if (card.lnbitsWithdrawId == null || card.isLockedByBulkWithdraw) {
    return false
  }
  try {
    const response = await axios.get(`${LNBITS_ORIGIN}/withdraw/api/v1/links/${card.lnbitsWithdrawId}`, {
      headers: {
        'Content-type': 'application/json',
        'X-Api-Key': LNBITS_INVOICE_READ_KEY,
      },
    })
    if (typeof response.data.used !== 'number') {
      throw new ErrorWithCode('Missing used count when checking withdraw status at lnbits.', ErrorCode.UnableToGetLnbitsWithdrawStatus)
    }
    if (response.data.used > 0) {
      return true
    } else {
      return false
    }
  } catch (error) {
    throw new ErrorWithCode(error, ErrorCode.UnableToGetLnbitsWithdrawStatus)
  }
}

/**
 * Creates lnurlp for a card.
 * 
 * Side-effects:
 *  - manipulates the given card
 *  - updates the card in the database
 * 
 * @param card CardApi
 * @param shared Boolean
 * @throws
 */
export const getLnurlpForCard = async (card: CardApi, shared: undefined | boolean = undefined): Promise<unknown> => {
  if (card.isLockedByBulkWithdraw) {
    return card
  }

  let id
  if (card.lnurlp?.id != null) {
    id = String(card.lnurlp.id)
    if (typeof shared === 'boolean') {
      card.lnurlp.shared = shared
    }
  } else {
    try {
      const response = await axios.post(`${LNBITS_ORIGIN}/lnurlp/api/v1/links/`, {
        description: 'Fund your tipcard!',
        min: 210,
        max: 210000,
        webhook_url: `${TIPCARDS_API_ORIGIN}/api/lnurlp/paid/${card.cardHash}`,
      }, {
        headers: {
          'Content-type': 'application/json',
          'X-Api-Key': LNBITS_ADMIN_KEY,
        },
      })
      id = String(response.data.id)
    } catch (error) {
      throw new ErrorWithCode(error, ErrorCode.UnableToCreateLnurlP)
    }
    card.invoice = null
    card.lnurlp = {
      shared: typeof shared === 'boolean' ? shared : false,
      amount: null,
      payment_hash: null,
      id,
      created: Math.round(+ new Date() / 1000),
      paid: null,
      expired: false,
    }
  }
  try {
    await updateCard(cardRedisFromCardApi(card))
  } catch (error) {
    throw new ErrorWithCode(error, ErrorCode.UnknownDatabaseError)
  }

  try {
    const response = await axios.get(`${LNBITS_ORIGIN}/lnurlp/api/v1/lnurl/${id}`)
    return response.data
  } catch (error) {
    throw new ErrorWithCode(error, ErrorCode.UnableToGetLnurlP)
  }
}

export const getLnurlpForNewCard = async (cardHash: string, shared = false): Promise<unknown> => {
  const card = ZodCardApi.parse({
    cardHash,
    text: 'Have fun with Bitcoin :)',
    invoice: null,
    lnurlp: null,
    lnbitsWithdrawId: null,
    used: null,
  })
  try {
    await createCard(cardRedisFromCardApi(card))
  } catch (error) {
    console.error(ErrorCode.UnknownDatabaseError, error)
    throw error
  }
  return getLnurlpForCard(card, shared)
}

/**
 * Checks if the set invoice has been paid.
 * 
 * Side-effects:
 *  - manipulates the given set
 *  - updates the set and cards (specified in set.invoice.fundedCards) in the database
 * 
 * @param set Set
 * @throws ErrorWithCode
 */
export const checkIfSetInvoiceIsPaid = async (set: Set): Promise<Set> => {
  if (
    set.invoice == null
    || set.invoice.paid != null
  ) {
    return set
  }
  try {
    const response = await axios.get(`${LNBITS_ORIGIN}/api/v1/payments/${set.invoice.payment_hash}`, {
      headers: {
        'Content-type': 'application/json',
        'X-Api-Key': LNBITS_INVOICE_READ_KEY,
      },
    })
    if (typeof response.data.paid !== 'boolean') {
      throw new ErrorWithCode('Missing paid status when checking invoice status at lnbits.', ErrorCode.UnableToGetLnbitsInvoiceStatus)
    }
    if (response.data.paid === true) {
      set.invoice.paid = Math.round(+ new Date() / 1000)
    }
  } catch (error) {
    // if the invoice doesnt exist anymore handle the expired invoice in the frontend
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        set.invoice.expired = true
        return set
      }
    }
    throw new ErrorWithCode(error, ErrorCode.UnableToGetLnbitsInvoiceStatus)
  }
  if (set.invoice.paid == null) {
    return set
  }

  try {
    // update all cards -> paid
    await Promise.all(set.invoice.fundedCards.map(async (cardIndex) => {
      const cardHash = hashSha256(`${set.id}/${cardIndex}`)
      const card = await getCardByHash(cardHash)
      if (card?.setFunding == null) {
        return
      }
      card.setFunding.paid = Math.round(+ new Date() / 1000)
      await updateCard(card)
    }))

    // update set -> paid
    await updateSet(set)
  } catch (error) {
    throw new ErrorWithCode(error, ErrorCode.UnknownDatabaseError)
  }
  return set
}

/**
 * 
 * @throws ZodError
 * @throws AxiosError
 */
export const isBulkWithdrawWithdrawn = async (bulkWithdraw: BulkWithdraw): Promise<boolean> => {
  if (bulkWithdraw.withdrawn != null) {
    return true
  }
  const response = await axios.get(`${LNBITS_ORIGIN}/withdraw/api/v1/links/${bulkWithdraw.lnbitsWithdrawId}`, {
    headers: {
      'Content-type': 'application/json',
      'X-Api-Key': LNBITS_INVOICE_READ_KEY,
    },
  })
  const used = z.object({ used: z.number() }).transform(({ used }) => used).parse(response.data)
  return used > 0
}
