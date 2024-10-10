import { generateCardHash } from '@e2e/lib/api/data/card'
import tipCards from '@e2e/lib/tipCards'
import tipCardsApi from '@e2e/lib/tipCardsApi'

describe('Landing Page', () => {
  it('should redirect to funding page if the card does not exist', () => {
    cy.then(async () => {
      const cardHash = await generateCardHash()
      tipCards.gotoLandingPagePreview(cardHash)

      cy.url().should('contain', `/funding/${cardHash}`)
    })
  })

  it('should should redirect to the invoice for an unfunded card with invoice', () => {
    cy.then(async () => {
      const cardHash = await generateCardHash()
      tipCardsApi.createInvoiceForCardHash(cardHash, 210)
      tipCards.gotoLandingPagePreview(cardHash)

      cy.url().should('contain', `/funding/${cardHash}`)
      cy.getTestElement('funding-invoice-text').should('contain', '210 sats')
    })
  })

  it.skip('should show the default landing page for a funded card', () => {
    // todo : fund a card via api #1252
  })

  it.skip('should rewrite the url to cardHash from /landing/?lightning=lnurl', () => {
    // todo : fund a card and then navigate to /landing/?lightning=lnurl i/o /landing/:cardHash #1252
  })

  it.skip('should load the status of a recently withdrawn card', () => {
    // todo : withdraw funded card #1252
  })
})
