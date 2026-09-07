import * as http from 'node:http'
import { createApiServer } from './server'

/** API entrypoint (GEN-110). Port via PORT env, default 3001. */
const port = Number(process.env.PORT ?? 3001)
const server: http.Server = createApiServer()
server.listen(port, () => {
  console.log(`Project Genesis API listening on http://localhost:${port} (dashboard at /)`)
})
