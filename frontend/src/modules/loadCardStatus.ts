import axios from 'axios'

import type { Card, CardStatus, CardStatusStatus } from '@root/data/Card'
import type { SuccessResponse } from '@root/data/Response'
import type { LandingPage } from '@root/data/LandingPage'

import { encodeLnurl, decodeLnurl } from '@/modules//lnurlHelpers'
import { BACKEND_API_ORIGIN } from '@/constants'
import { LNBITS_ORIGIN } from '@root/constants'

/**
 * @param cardHash
 * @param origin
 * @throws
 */
export const loadCard = async (cardHash: string, origin: string | undefined = undefined): Promise<Card> => {
  let url = `${BACKEND_API_ORIGIN}/api/card/${cardHash}`
  if (origin != null) {
    url = `${url}?origin=${origin}`
  }
  try {
    const response = await axios.get(
      url,
      {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      },
    )
    return response.data.data as Card
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return {
        cardHash,
        invoice: null,
        lnurlp: null,
        lnbitsWithdrawId: null,
        used: null,
      }
    }
    console.error(error)
    throw error
  }
}

/**
 * @deprecated use @root/data/Card/CardStatus instead
 */
export type CardStatusDeprecated = {
  status: 'error' | 'unfunded' | 'funded' | 'used' | 'invoice' | 'lnurlp' | 'setFunding'
  amount?: number
  shared?: boolean
  createdDate?: number,
  fundedDate?: number,
  message?: string // a message intended for the user
  card?: Card
}

export const loadCardStatusForLnurl = async (lnurl: string): Promise<CardStatusDeprecated> => {
  let lnurlDecoded: URL
  try {
    lnurlDecoded = new URL(decodeLnurl(lnurl))
  } catch (error) {
    console.error(error)
    return {
      status: 'error',
      message: 'Sorry, the provided LNURL is invalid.',
    }
  }

  if (lnurlDecoded.origin !== BACKEND_API_ORIGIN && lnurlDecoded.origin !== LNBITS_ORIGIN) {
    console.error(`LNURL points to a foreign origin: ${lnurlDecoded.origin}`)
    return {
      status: 'error',
      message: 'Sorry, the provided LNURL cannot be used on this website.',
    }
  }

  const cardHashMatch = lnurlDecoded.pathname.match(/\/api\/lnurl\/([a-z0-9]*)/)
  if (cardHashMatch == null) {
    return {
      status: 'error',
      message: 'Sorry, the provided LNURL is invalid.',
    }
  }
  return loadCardStatus(cardHashMatch[1])
}

export const loadCardStatus = async (cardHash: string, origin: string | undefined = undefined): Promise<CardStatusDeprecated> => {
  let card: Card | null
  try {
    card = await loadCard(cardHash, origin)
  } catch (error) {
    return {
      status: 'error',
      message: 'Unable to load the Tip Card status as the server is currently not reachable. Please try again later.',
    }
  }
  if (card == null) {
    return {
      status: 'unfunded',
      shared: false,
    }
  }

  let amount
  let shared = false
  let createdDate
  let fundedDate
  if (card.invoice != null) {
    amount = card.invoice.amount
    createdDate = card.invoice.created
    fundedDate = card.invoice.paid != null ? card.invoice.paid : undefined
  } else if (card.lnurlp != null) {
    amount = card.lnurlp.amount != null ? card.lnurlp.amount : undefined
    shared = card.lnurlp.shared || false
    createdDate = card.lnurlp.created
    fundedDate = card.lnurlp.paid != null ? card.lnurlp.paid : undefined
  } else if (card.setFunding != null) {
    amount = card.setFunding.amount
    createdDate = card.setFunding.created
    fundedDate = card.setFunding.paid != null ? card.setFunding.paid : undefined
  }
  
  if (card.used != null) {
    return {
      status: 'used',
      amount,
      shared,
      createdDate,
      fundedDate,
      card,
    }
  }
  if (card.lnbitsWithdrawId != null) {
    return {
      status: 'funded',
      amount,
      shared,
      createdDate,
      fundedDate,
      card,
    }  
  }
  if (card.invoice != null && card.invoice.paid == null) {
    return {
      status: 'invoice',
      amount: card.invoice.amount,
      shared,
      createdDate,
      fundedDate,
      card,
    }
  }
  if (card.lnurlp != null && card.lnurlp.paid == null) {
    return {
      status: 'lnurlp',
      amount: card.lnurlp.amount != null ? card.lnurlp.amount : undefined,
      shared,
      createdDate,
      fundedDate,
      card,
    }
  }
  if (card.setFunding != null && card.setFunding.paid == null) {
    return {
      status: 'setFunding',
      amount,
      shared,
      createdDate,
      fundedDate,
      card,
    }
  }
  return {
    status: 'unfunded',
    card,
  }
}

export const loadLandingPageForCard = async (card: Card): Promise<LandingPage | null> => {
  if (card.landingPageId == null) {
    return null
  }
  let responseData: SuccessResponse
  try {
    const response = await axios.get(
      `${BACKEND_API_ORIGIN}/api/landingPages/${card.landingPageId}`,
      {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      },
    )
    responseData = response.data
  } catch (error) {
    console.error(error)
    return null
  }
  if (responseData.status !== 'success') {
    return null
  }
  return responseData.data as LandingPage
}

export const getCardStatusForCard = (card: Card): CardStatus => {
  const lnurlDecoded = `${BACKEND_API_ORIGIN}/api/lnurl/${card.cardHash}`
  const lnurl = encodeLnurl(lnurlDecoded)

  let status: CardStatusStatus = 'unfunded'
  let amount
  let createdDate
  let fundedDate
  let withdrawnDate

  if (card.invoice != null) {
    status = card.invoice.expired ? 'invoiceExpired' : 'invoiceFunding'
    amount = card.invoice.amount
    createdDate = card.invoice.created
    fundedDate = card.invoice.paid != null ? card.invoice.paid : undefined
  } else if (card.lnurlp != null) {
    status = card.lnurlp.expired ? 'lnurlpExpired' : 'lnurlpFunding'
    amount = card.lnurlp.amount != null ? card.lnurlp.amount : undefined
    createdDate = card.lnurlp.created
    fundedDate = card.lnurlp.paid != null ? card.lnurlp.paid : undefined
    if (card.lnurlp.shared) {
      status = card.lnurlp.expired
        ? amount != null && amount > 0 ? 'lnurlpSharedExpiredFunded' : 'lnurlpSharedExpiredEmpty'
        : 'lnurlpSharedFunding'
    }
  } else if (card.setFunding != null) {
    status = card.setFunding.expired ? 'setInvoiceExpired' : 'setInvoiceFunding'
    amount = card.setFunding.amount
    createdDate = card.setFunding.created
    fundedDate = card.setFunding.paid != null ? card.setFunding.paid : undefined
  }

  if (fundedDate != null) {
    status = 'funded'
  }
  if (card.withdrawPending) {
    status = 'withdrawPending'
  }
  if (card.used != null) {
    withdrawnDate = card.used
    status = (+ new Date() / 1000) - withdrawnDate < 5 * 60 ? 'recentlyWithdrawn' : 'withdrawn'
  }

  return {
    lnurl,
    status,
    amount,
    createdDate,
    fundedDate,
    withdrawnDate,
  }
}
