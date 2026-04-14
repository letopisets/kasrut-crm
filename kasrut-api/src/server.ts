import { createApp } from './app'
import { env } from './config/env'

const app = createApp()

app.listen(env.PORT, () => {
  console.log(`KashrutCRM API running on http://localhost:${env.PORT}`)
  console.log(`Health: http://localhost:${env.PORT}/health`)
})
