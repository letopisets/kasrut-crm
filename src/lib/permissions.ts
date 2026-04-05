import type  {Role}  from '../types/user'

interface Permissions {
  tabs: string[]
  canEdit: boolean
  seeAll: boolean
  isOwner: boolean
}

export const PERMISSIONS: Record<Role, Permissions> = {
  owner: {
    tabs: ['dashboard','restaurants','inspections',
           'mashgichim','hechsherim','documents','rabbanuts','users'],
    canEdit: true,
    seeAll: true,
    isOwner: true,
  },
  rabbanut: {
    tabs: ['dashboard','restaurants','inspections',
           'mashgichim','hechsherim','documents'],
    canEdit: true,
    seeAll: false,
    isOwner: false,
  },
  mashgiach: {
    tabs: ['dashboard','restaurants','inspections','documents'],
    canEdit: false,
    seeAll: false,
    isOwner: false,
  },
}