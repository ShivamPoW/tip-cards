import { Card } from '@shared/data/redis/Card'

export const CARD_FUNDED_INVOICE = Card.parse({
  cardHash: 'cardIntegrationTestCardFundedInvoice',
  invoice: {
    amount: 100,
    payment_hash: '',
    payment_request: '',
    created: 123,
    paid: 1234,
  },
})
