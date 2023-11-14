import '../../../mocks/process.env'
import { addCardVersions, addInvoices, addCardVersionInvoices, addLnurlWs } from '../mocks/queries'

import { getCardByHash } from '@backend/database/drizzle/queriesRedis'

import {
  CARD_VERSION_INVOICE_FUNDING,
  INVOICE_FOR_INVOICE_FUNDING,
  CARD_VERSION_INVOICE_FOR_INVOICE_FUNDING,
} from '../data/InvoiceFunding'
import {
  CARD_VERSION_INVOICE_FUNDING_FUNDED,
  INVOICE_FOR_INVOICE_FUNDING_FUNDED,
  CARD_VERSION_INVOICE_FOR_INVOICE_FUNDING_FUNDED,
  LNURL_W_FOR_INVOICE_FUNDING_FUNDED,
} from '../data/InvoiceFundingFunded'

describe('getCardByHash invoice funding', () => {
  it('should return a card funded by invoice', async () => {
    addCardVersions(CARD_VERSION_INVOICE_FUNDING)
    addInvoices(INVOICE_FOR_INVOICE_FUNDING)
    addCardVersionInvoices(CARD_VERSION_INVOICE_FOR_INVOICE_FUNDING)

    const card = await getCardByHash(CARD_VERSION_INVOICE_FUNDING.card)
    expect(card).toEqual(expect.objectContaining({
      cardHash: CARD_VERSION_INVOICE_FUNDING.card,
      text: CARD_VERSION_INVOICE_FUNDING.textForWithdraw,
      note: CARD_VERSION_INVOICE_FUNDING.noteForStatusPage,
      invoice: expect.objectContaining({
        amount: INVOICE_FOR_INVOICE_FUNDING.amount,
        payment_hash: INVOICE_FOR_INVOICE_FUNDING.paymentHash,
        payment_request: INVOICE_FOR_INVOICE_FUNDING.paymentRequest,
        created: Math.round(INVOICE_FOR_INVOICE_FUNDING.created.getTime() / 1000),
        paid: INVOICE_FOR_INVOICE_FUNDING.paid != null ? Math.round(INVOICE_FOR_INVOICE_FUNDING.paid.getTime() / 1000) : null,
      }),
      lnurlp: null,
      setFunding: null,
      lnbitsWithdrawId: null,
    }))
  })

  it('should add the lnbitsWithdrawId when it exists', async () => {
    addCardVersions(CARD_VERSION_INVOICE_FUNDING_FUNDED)
    addInvoices(INVOICE_FOR_INVOICE_FUNDING_FUNDED)
    addCardVersionInvoices(CARD_VERSION_INVOICE_FOR_INVOICE_FUNDING_FUNDED)
    addLnurlWs(LNURL_W_FOR_INVOICE_FUNDING_FUNDED)

    const card = await getCardByHash(CARD_VERSION_INVOICE_FUNDING_FUNDED.card)
    expect(card).toEqual(expect.objectContaining({
      cardHash: CARD_VERSION_INVOICE_FUNDING_FUNDED.card,
      text: CARD_VERSION_INVOICE_FUNDING_FUNDED.textForWithdraw,
      note: CARD_VERSION_INVOICE_FUNDING_FUNDED.noteForStatusPage,
      invoice: expect.objectContaining({
        amount: INVOICE_FOR_INVOICE_FUNDING_FUNDED.amount,
        payment_hash: INVOICE_FOR_INVOICE_FUNDING_FUNDED.paymentHash,
        payment_request: INVOICE_FOR_INVOICE_FUNDING_FUNDED.paymentRequest,
        created: Math.round(INVOICE_FOR_INVOICE_FUNDING_FUNDED.created.getTime() / 1000),
        paid: INVOICE_FOR_INVOICE_FUNDING_FUNDED.paid != null ? Math.round(INVOICE_FOR_INVOICE_FUNDING_FUNDED.paid.getTime() / 1000) : null,
      }),
      lnurlp: null,
      setFunding: null,
      lnbitsWithdrawId: LNURL_W_FOR_INVOICE_FUNDING_FUNDED.lnbitsId,
    }))
  })
})
