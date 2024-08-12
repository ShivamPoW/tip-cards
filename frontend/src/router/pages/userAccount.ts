import type { RouteRecordInfo } from 'vue-router'

import i18n from '@/modules/initI18n'
import {
  localizedRoutePrefix,
  type LocalizedRouteParamsRaw,
  type LocalizedRouteParams,
  type AppRouteMeta,
} from '@/router/utils'

export interface RouteUserAccount extends RouteRecordInfo<
  'user-account',
  `${localizedRoutePrefix}/user-account`,
  LocalizedRouteParamsRaw,
  LocalizedRouteParams,
  AppRouteMeta
> {}

export const userAccount = {
  name: 'user-account',
  path: `${localizedRoutePrefix}/user-account`,
  component: () => import('@/pages/PageUserAccount.vue'),
  meta: {
    title: () => i18n.global.t('userAccount.title'),
    backlink: true, // Is only used by BackLinkDeprecated
  },
}
