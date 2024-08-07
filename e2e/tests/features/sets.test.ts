import { TIPCARDS_ORIGIN } from '@e2e/lib/constants'

const SETS_PAGE_URL = new URL('/sets', TIPCARDS_ORIGIN)

describe('Sets Page', () => {
  it.skip('Should see the sets of the logged in user', () => {
    cy.login()
    cy.visit(SETS_PAGE_URL.href)
    cy.location('pathname').should('equal', '/sets')
    cy.getTestElement('the-layout', { timeout: 30000 }).should('exist')
    cy.getTestElement('please-login-section', { timeout: 30000 }).should('not.exist')
    cy.getTestElement('logged-in', { timeout: 30000 }).should('exist')
  })

  it.skip('should navigate to the cards page when the new set button is clicked', () => {
  })

  it.skip('should show an empty sets page', () => {
  })

  it.skip('should show a list of named and nameless sets', () => {
  })

  it.skip('should navigate to a saved set', () => {
    // How do I verify if it's a new set or saved set?
  })
})
