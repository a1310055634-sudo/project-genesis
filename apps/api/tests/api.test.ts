import { describe, it, expect, afterAll } from 'vitest'
import * as http from 'node:http'
import { AddressInfo } from 'node:net'
import { createApiServer } from '../src/server'

/** API integration test (GEN-110/111/112): drives a real 100-person, 1-year
 * run through HTTP and verifies the dashboard contract reads real state. */

let server: http.Server | null = null
let baseUrl = ''

function startServer(): Promise<void> {
  server = createApiServer()
  return new Promise((resolve) => {
    server!.listen(0, () => {
      const addr = server!.address() as AddressInfo
      baseUrl = `http://127.0.0.1:${addr.port}`
      resolve()
    })
  })
}

async function post(path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(baseUrl + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  return (await res.json()) as Record<string, unknown>
}

async function get(path: string): Promise<{ code: number; json: unknown }> {
  const res = await fetch(baseUrl + path)
  return { code: res.status, json: (await res.json()) as unknown }
}

async function waitForDone(timeoutMs = 60_000): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const { json } = await get('/api/status')
    const status = json as Record<string, unknown>
    if (status.state === 'done' || status.error !== null) return status
    if (Date.now() > deadline) throw new Error('simulation did not finish in time')
    await new Promise((r) => setTimeout(r, 200))
  }
}

describe('genesis API (GEN-110/111/112)', () => {
  afterAll(() => {
    void post('/api/sim/stop')
    server?.close()
  })

  it('serves the dashboard HTML at /', async () => {
    await startServer()
    const res = await fetch(baseUrl + '/')
    const html = await res.text()
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(html).toContain('Project Genesis')
    expect(html).toContain('Person inspector')
  })

  it('runs a simulation end-to-end and exposes real state', async () => {
    const started = await post('/api/sim/start', { seed: 42, population: 100, years: 1 })
    expect(started['state']).toBe('running')

    const final = await waitForDone()
    expect(final['state']).toBe('done')
    expect(final['error']).toBeNull()
    expect(final['progress']).toBe(1)
    expect(typeof final['digest']).toBe('string')

    const population = final['population'] as Record<string, unknown>
    expect(Number(population['alive'])).toBeGreaterThan(0)
    const metrics = final['metrics'] as Record<string, number>
    expect(metrics['population']).toBeGreaterThan(0)
    expect(metrics['employment_rate']).toBeGreaterThan(0)

    // history chart data was sampled
    const history = final['history'] as Array<Record<string, unknown>>
    expect(history.length).toBeGreaterThan(0)

    // person inspector returns a real dossier
    const person = await get('/api/persons/person-000001')
    expect(person.code).toBe(200)
    const identity = (person.json as Record<string, unknown>)['identity'] as Record<string, unknown>
    expect(identity['id']).toBe('person-000001')
    expect(identity['sex']).toMatch(/male|female/)

    // events endpoint works
    const events = await get('/api/events?limit=5')
    expect(Array.isArray(events.json)).toBe(true)
    expect((events.json as unknown[]).length).toBeLessThanOrEqual(5)

    // export manifest
    const manifest = await get('/api/export')
    expect((manifest.json as Record<string, unknown>)['digest']).toBe(final['digest'])

    // unknown person → 400 with message
    const missing = await get('/api/persons/person-999999')
    expect(missing.code).toBe(400)

    // second start while done is allowed (fresh run)
    const again = await post('/api/sim/start', { seed: 7, population: 60, years: 1 })
    expect(again['state']).toBe('running')
    const stopped = await post('/api/sim/stop')
    expect(stopped['state']).toBe('idle')
  }, 90_000)

  it('rejects starting while a run is active and pausing works', async () => {
    await post('/api/sim/start', { seed: 42, population: 300, years: 2 })
    const duplicate = await post('/api/sim/start', { seed: 1, population: 50, years: 1 })
    expect(duplicate['error']).toMatch(/already active/)

    const paused = await post('/api/sim/pause')
    expect(paused['state']).toBe('paused')

    const stepped = await post('/api/sim/step')
    expect(['paused', 'done']).toContain(stepped['state'])

    const speed = await post('/api/sim/speed', { ticksPerChunk: 2880 })
    expect(speed['chunkTicks']).toBe(2880)

    await post('/api/sim/stop')
    const status = await get('/api/status')
    expect((status.json as Record<string, unknown>)['state']).toBe('idle')
  }, 60_000)
})
