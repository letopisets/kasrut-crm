export interface Translations {
  appName: string
  appSub: string
  nav: {
    dashboard: string
    restaurants: string
    inspections: string
    mashgichim: string
    hechsherim: string
    documents: string
    rabbanuts: string
    users: string
  }
  roles: { owner: string; rabbanut: string; mashgiach: string }
  roleDesc: { owner: string; rabbanut: string; mashgiach: string }
  dashboard: { title: string; sub: string }
  stats: [string, string, string, string]
  statsSub: [string, string, string, string]
  expiring: string
  upcoming: string
  days: string
  today: string
  in: string
  status: { ok: string; warning: string; critical: string }
  back: string
  logout: string
  restaurants: {
    title: string
    sub: string
    add: string
    filters: [string, string, string, string]
    cols: { level: string; hechsher: string; mashgiach: string; expires: string }
    actions: string
    actionList: [string, string, string, string]
  }
  addRest: {
    title: string
    name: string
    address: string
    city: string
    level: string
    hechsher: string
    mashgiach: string
    kitniyot: string
    expires: string
    notes: string
    save: string
    cancel: string
  }
  inspections: {
    title: string
    sub: string
    add: string
    planned: string
    urgent: string
    addTitle: string
    restaurant: string
    date: string
    type: string
    assign: string
    notes: string
    result: { pending: string; open: string; pass: string; fail: string }
    save: string
    cancel: string
  }
  mashgichim: {
    title: string
    sub: string
    add: string
    phone: string
    email: string
    area: string
    hechsherim: string
    assigned: string
    active: string
    inactive: string
    addTitle: string
    name: string
    save: string
    cancel: string
    remove: string
    confirmRemove: string
    noHechsher: string
  }
  hechsherim: {
    title: string
    sub: string
    add: string
    addTitle: string
    name: string
    shortName: string
    city: string
    contact: string
    phone: string
    email: string
    type: string
    types: [string, string, string, string]
    save: string
    cancel: string
    remove: string
    confirmRemove: string
    establishments: string
    mashgichim: string
  }
  documents: {
    title: string
    sub: string
    add: string
    categories: [string, string, string, string, string]
    view: string
    download: string
  }
  rabbanuts: {
    title: string
    sub: string
    add: string
    name: string
    city: string
    contact: string
    phone: string
    email: string
    save: string
    cancel: string
    remove: string
    confirmRemove: string
    establishments: string
    mashgichim: string
    active: string
    inactive: string
  }
  users: {
    title: string
    sub: string
    add: string
    role: string
    org: string
    status: string
    lastLogin: string
  }
  noAccess: string
  myEstablishments: string
  myInspections: string
  ownerBanner: string
  allRabbanuts: string
}
