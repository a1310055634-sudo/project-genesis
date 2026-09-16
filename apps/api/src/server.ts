import { IncomingMessage, Server, ServerResponse, createServer } from 'node:http'
import { SimulationController, StatusPayload } from './controller'
import { dashboardHtml } from './dashboard'

/**
 * HTTP API (GEN-110): controls one simulation and exposes real state.
 * Routes:
 *   GET  /                    dashboard (vanilla single page)
 *   GET  /api/status          state/tick/progress/metrics/history
 *   POST /api/sim/start       {seed, population, years, profile?}
 *   POST /api/sim/pause       —
 *   POST /api/sim/resume      —
 *   POST /api/sim/stop        —
 *   POST /api/sim/step        — advance one chunk while paused
 *   POST /api/sim/speed       {ticksPerChunk}
 *   GET  /api/persons/:id     full person dossier
 *   GET  /api/persons/:id/timeline  life milestones (Roadmap D2)
 *   GET  /api/persons/:id/kinship   family tree around a person (Roadmap D3)
 *   GET  /api/persons/:id/beliefs   belief-network slice (Roadmap D4)
 *   GET  /api/events?limit=n  recent events (bounded window)
 *   GET  /api/export          run manifest JSON
 */
export function createApiServer(controller: SimulationController = new SimulationController()): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname
    const send = (code: number, body: unknown): void => {
      res.statusCode = code
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(body))
    }
    const readBody = (): Promise<string> =>
      new Promise((resolve, reject) => {
        let data = ''
        req.on('data', (chunk) => {
          data += chunk
          if (data.length > 1_000_000) {
            // red team RT2-04: stop buffering and kill the socket, otherwise
            // the 1MB limit only schedules the 400 but the buffer keeps growing
            req.removeAllListeners('data')
            req.removeAllListeners('end')
            req.destroy(new Error('body too large'))
            reject(new Error('body too large'))
          }
        })
        req.on('end', () => resolve(data))
        req.on('error', (err) => {
          if (!req.destroyed) reject(err)
        })
      })

    const route = async (): Promise<void> => {
      if (req.method === 'GET' && path === '/') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(dashboardHtml())
        return
      }
      try {
        if (req.method === 'GET' && path === '/api/status') {
          send(200, controller.status())
          return
        }
        if (req.method === 'POST' && path === '/api/sim/start') {
          const body = JSON.parse((await readBody()) || '{}') as Record<string, unknown>
          const payload = controller.start({
            seed: typeof body.seed === 'number' ? body.seed : String(body.seed ?? 42),
            population: Number(body.population ?? 1_000),
            years: Number(body.years ?? 1),
            profile: body.profile === 'minimal' ? 'minimal' : 'full'
          })
          send(200, payload)
          return
        }
        if (req.method === 'POST' && path === '/api/sim/pause') {
          controller.pause()
          send(200, controller.status())
          return
        }
        if (req.method === 'POST' && path === '/api/sim/resume') {
          controller.resume()
          send(200, controller.status())
          return
        }
        if (req.method === 'POST' && path === '/api/sim/stop') {
          controller.stop()
          send(200, controller.status())
          return
        }
        if (req.method === 'POST' && path === '/api/sim/step') {
          send(200, controller.stepOnce())
          return
        }
        if (req.method === 'POST' && path === '/api/sim/speed') {
          const body = JSON.parse((await readBody()) || '{}') as { ticksPerChunk?: number }
          controller.setSpeed(Number(body.ticksPerChunk ?? 720))
          send(200, { chunkTicks: Number(body.ticksPerChunk ?? 720) })
          return
        }
        const beliefsMatch = path.match(/^\/api\/persons\/([\w-]+)\/beliefs$/)
        if (req.method === 'GET' && beliefsMatch !== null) {
          send(200, controller.beliefNetwork(beliefsMatch[1] as string))
          return
        }
        const kinshipMatch = path.match(/^\/api\/persons\/([\w-]+)\/kinship$/)
        if (req.method === 'GET' && kinshipMatch !== null) {
          send(200, controller.kinship(kinshipMatch[1] as string))
          return
        }
        const timelineMatch = path.match(/^\/api\/persons\/([\w-]+)\/timeline$/)
        if (req.method === 'GET' && timelineMatch !== null) {
          send(200, controller.timeline(timelineMatch[1] as string))
          return
        }
        const personMatch = path.match(/^\/api\/persons\/([\w-]+)$/)
        if (req.method === 'GET' && personMatch !== null) {
          send(200, controller.person(personMatch[1] as string))
          return
        }
        if (req.method === 'GET' && path === '/api/events') {
          send(200, controller.events(Number(url.searchParams.get('limit') ?? 50)))
          return
        }
        if (req.method === 'GET' && path === '/api/export') {
          send(200, controller.exportManifest())
          return
        }
        send(404, { error: `no route: ${req.method} ${path}` })
      } catch (e) {
        send(400, { error: e instanceof Error ? e.message : String(e) })
      }
    }
    void route()
  })
}

/** Type re-export for tests. */
export type { StatusPayload }
