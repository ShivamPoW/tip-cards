import '../../../mocks/process.env'
import { addData } from '../mocks/queries'

import { createCard, createCardVersion, createInvoice, createLnurlP } from '../../../../drizzleData'

import { getCardByHash } from '@backend/database/drizzle/queriesRedis'

describe('getCardByHash lnurlp funding', () => {
  it('should return a card funded by lnurlp', async () => {
    const card = createCard()
    const cardVersion = createCardVersion(card)
    const lnurlp = createLnurlP(cardVersion)
    const { invoice, cardVersionsHaveInvoice } = createInvoice(500, cardVersion)
    invoice.paid = new Date()
    addData({
      cards: [card],
      cardVersions: [cardVersion],
      invoices: [invoice],
      cardVersionInvoices: [...cardVersionsHaveInvoice],
      lnurlps: [lnurlp],
    })

    const cardRedis = await getCardByHash(card.hash)
    expect(cardRedis).toEqual(expect.objectContaining({
      cardHash: card.hash,
      text: cardVersion.textForWithdraw,
      note: cardVersion.noteForStatusPage,
      invoice: null,
      lnurlp: expect.objectContaining({
        amount: 500,
        payment_hash: expect.arrayContaining([invoice.paymentHash]),
        shared: false,
      }),
      setFunding: null,
      lnbitsWithdrawId: null,
      landingPageViewed: null,
      isLockedByBulkWithdraw: false,
      used: null,
    }))
  })
})
