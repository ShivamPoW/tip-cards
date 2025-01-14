import tipCards from '@e2e/lib/tipCards'
import tipCardsApi from '@e2e/lib/tipCardsApi'

describe('Login Overlay', () => {
  beforeEach(() => {
    tipCardsApi.auth.clearAuth()
    tipCardsApi.auth.createNewKeysAndWrap()
    tipCards.gotoHomePage()
  })

  it('check if user is logged out', () => {
    cy.getTestElement('the-layout').should('exist')
    cy.getTestElement('logged-in').should('not.exist')
    cy.getTestElement('modal-login').should('not.exist')
  })

  it('Close ModalLogin with close button', () => {
    openModalLogin()
    cy.getTestElement('modal-login-close-button').click()
    cy.getTestElement('modal-login').should('not.exist')
  })

  it('Login with click on qr code', () => {
    openModalLogin()
    wrapLNURLAuthFromLinkClick()
    tipCardsApi.auth.lnurlAuthLoginWithWrappedKeyPair()
    checkLoginSuccess()
    reloadPageAndCheckAuth()
  })

  it('Login with lnurl from clipboard', () => {
    openModalLogin()
    cy.addListener('copy', (event) => {
      cy.log(event)
    })

    cy.getTestElement('lnurlauth-qrcode-copy-2-clipboard').click()
    cy.task<string>('getClipboard').then((clipboardText) => {
      cy.wrap(clipboardText).as('lnurlAuthUrl')
    })

    tipCardsApi.auth.lnurlAuthLoginWithWrappedKeyPair()
    checkLoginSuccess()
    reloadPageAndCheckAuth()
  })

  it('Should login, after a login and logout has happend without reloading or revisiting the page', () => {
    // Login
    openModalLogin()
    wrapLNURLAuthFromLinkClick()
    tipCardsApi.auth.lnurlAuthLoginWithWrappedKeyPair()
    checkLoginSuccess()

    // Logout
    cy.getTestElement('the-header-main-nav-button').click()
    cy.getTestElement('main-nav-link-logout').click()

    // Second Login
    openModalLogin()
    wrapLNURLAuthFromLinkClick()
    tipCardsApi.auth.lnurlAuthLoginWithWrappedKeyPair()
    checkLoginSuccess()
    reloadPageAndCheckAuth()
  })
})

const openModalLogin = () => {
  cy.getTestElement('the-layout').should('exist')
  cy.getTestElement('logged-in').should('not.exist')
  cy.getTestElement('the-header-main-nav-button').click()

  cy.getTestElement('main-nav-link-login').click()
  cy.getTestElement('modal-login').should('exist')
}

const wrapLNURLAuthFromLinkClick = () => {
  cy.getTestElement('lightning-qr-code-image')
    .should('have.attr', 'href')
    .and('match', /^lightning:.+/)

  // Stub the link click, because cypress can not handle different protocolls, then http and https
  // Attention: You should not use variables! Please refactor if you have an idea!
  let lnurlAuthUrlHref = ''
  cy.get('a[href^="lightning:"]').then(($link) => {
    $link.on('click', (e) => {
      e.preventDefault()
      lnurlAuthUrlHref = $link.attr('href')
    })
  })

  cy.getTestElement('lightning-qr-code-image').click()

  cy.then(() => {
    const lnurlAuthUrl = lnurlAuthUrlHref.substring(10)
    cy.wrap(lnurlAuthUrl).as('lnurlAuthUrl')
  })
}

const checkLoginSuccess = () => {
  cy.getTestElement('lightning-qr-code-image-success').should('exist')
  cy.getTestElement('modal-login-close-button').click()
  cy.getTestElement('modal-login').should('not.exist')
}

const reloadPageAndCheckAuth = () => {
  tipCards.reloadPage()
  tipCards.isLoggedIn()
}
