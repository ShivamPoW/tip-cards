import i18n from '../../mocks/i18n'
import '../../mocks/provide'
import '../../mocks/router'

import { describe, it, expect } from 'vitest'

import { SetDto } from '@shared/data/trpc/SetDto'
import SetDisplayInfo from '@/pages/sets/modules/SetDisplayInfo'

describe('SetDisplayInfo', () => {
  it('should create a SetDisplayInfo object with the correct values', () => {
    const set = SetDto.parse({
      id: 'set1-id',
      created: new Date('2012-12-12T12:12:00'),
      settings: { name: 'set1', numberOfCards: 4 },
    })

    const setDisplayInfo = SetDisplayInfo.create(set, i18n.global)

    expect(setDisplayInfo.displayName).toBe(set.settings.name)
    expect(setDisplayInfo.displayDate).toBe('12/12/2012, 12:12 PM')
    expect(setDisplayInfo.displayNumberOfCards).toBe('4 cards')
    expect(setDisplayInfo.combinedSearchableString).toBe('set1 12/12/2012, 12:12 PM 4 cards')
  })
})
