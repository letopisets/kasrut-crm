import { smtpTransportOptions } from '../lib/mailer'

// docker-compose forwards SMTP_* as ${VAR:-}: empty strings must behave as unset.
describe('smtpTransportOptions', () => {
  const KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'] as const
  const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {}

  beforeEach(() => {
    for (const key of KEYS) { saved[key] = process.env[key]; delete process.env[key] }
  })
  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })

  it.each([
    ['unset', {}],
    ['empty', { SMTP_HOST: '', SMTP_PORT: '', SMTP_USER: '', SMTP_PASS: '' }],
  ])('uses the defaults when the variables are %s', (_label, values) => {
    Object.assign(process.env, values)
    expect(smtpTransportOptions()).toMatchObject({ host: 'localhost', port: 587, secure: false, auth: undefined })
  })

  it('uses a configured server', () => {
    Object.assign(process.env, { SMTP_HOST: 'smtp.example.org', SMTP_PORT: '465', SMTP_USER: 'mailer@example.org', SMTP_PASS: 'pw' })
    expect(smtpTransportOptions()).toMatchObject({
      host: 'smtp.example.org',
      port: 465,
      secure: true,
      auth: { user: 'mailer@example.org', pass: 'pw' },
    })
  })
})
