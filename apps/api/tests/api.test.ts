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
  afterAll(async () => {
    // drain the stop request before closing: killing an in-flight keep-alive
    // fetch surfaces as an unhandled ECONNRESET rejection (vitest "1 error")
    await post('/api/sim/stop').catch(() => {})
    if (server !== null) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
    }
  })

  it('serves the dashboard HTML at /', async () => {
    await startServer()
    const res = await fetch(baseUrl + '/')
    const html = await res.text()
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(html).toContain('Project Genesis')
    expect(html).toContain('Person inspector')
    // institutions/media side-tables surfaced in the UI (BACKLOG #5)
    expect(html).toContain('School')
    expect(html).toContain('Media exposure')
    expect(html).toContain('school pupils')
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

    // history chart data was sampled — with REAL stress/wellbeing values,
    // not a series of nulls (red team RT2-02 blind spot)
    const history = final['history'] as Array<Record<string, unknown>>
    expect(history.length).toBeGreaterThan(0)
    expect(history.some((h) => h['stress'] !== null)).toBe(true)
    expect(history.some((h) => h['wellbeing'] !== null)).toBe(true)
    expect(history.some((h) => h['population'] !== null)).toBe(true)

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

    // export manifest (final flag + digest, red team RT2-09)
    const manifest = await get('/api/export')
    expect((manifest.json as Record<string, unknown>)['final']).toBe(true)
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

describe('person dossier depth (education + housing + media side-tables)', () => {
  // self-contained: own server on an ephemeral port, no order dependence on
  // the shared module-level server (the shared one gets closed by afterAll)
  it('dossier exposes education attainment/skill and housing burden', async () => {
    const { createApiServer } = await import('../src/server')
    const srv = createApiServer()
    const addr = srv.listen(0)
    await new Promise((resolve) => srv.once('listening', resolve))
    const address = srv.address() as AddressInfo
    const base = `http://127.0.0.1:${address.port}`

    try {
      const startRes = await fetch(base + '/api/sim/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: 42, population: 120, years: 2 })
      })
      expect(startRes.status).toBe(200)

      // poll to completion (bounded)
      const deadline = Date.now() + 60_000
      let done = false
      while (Date.now() < deadline) {
        const status = (await (await fetch(base + '/api/status')).json()) as Record<string, unknown>
        if (status['state'] === 'done' || status['state'] === 'idle') { done = true; break }
        await new Promise((r) => setTimeout(r, 150))
      }
      expect(done).toBe(true)

      const personRes = await fetch(base + '/api/persons/person-000001')
      expect(personRes.status).toBe(200)
      const dossier = (await personRes.json()) as Record<string, Record<string, unknown>>
      expect(dossier['education']).toBeDefined()
      const education = dossier['education'] as Record<string, unknown>
      expect(typeof education['attainment']).toBe('string')
      expect(typeof education['skill']).toBe('number')
      expect(dossier['housing']).toBeDefined()
      const housing = dossier['housing'] as Record<string, unknown>
      expect(typeof housing['burden']).toBe('number')
      // RT6-B3: institutions key always present; shape-checked either way
      // (null for non-pupils, {schoolId, overflow, quality} for pupils —
      // quality null for overflow pupils per RT6-B2)
      expect('institutions' in dossier).toBe(true)
      const inst = dossier['institutions'] as Record<string, unknown> | null
      if (inst !== null) {
        expect(typeof inst['schoolId']).toBe('string')
        expect(typeof inst['overflow']).toBe('boolean')
        expect(inst['quality'] === null || typeof inst['quality'] === 'number').toBe(true)
      }
      // media exposure block carries the heard-piece list
      const mediaExposure = dossier['mediaExposure'] as Record<string, unknown>
      expect(Array.isArray(mediaExposure['piecesHeard'])).toBe(true)

      // D2: life timeline — birth first, ticks sorted, undated list present
      const tlRes = await fetch(base + '/api/persons/person-000001/timeline')
      expect(tlRes.status).toBe(200)
      const tl = (await tlRes.json()) as {
        milestones: Array<{ tick: number; type: string }>
        undated: unknown[]
      }
      expect(tl.milestones.length).toBeGreaterThan(0)
      expect(tl.milestones[0]['type']).toBe('birth')
      const ticks = tl.milestones.map((m) => m['tick'] as number)
      expect([...ticks].sort((x, y) => x - y)).toEqual(ticks)
      expect(Array.isArray(tl.undated)).toBe(true)

      // D3: kinship view — root identity + disjoint relation sections
      const kinRes = await fetch(base + '/api/persons/person-000001/kinship')
      expect(kinRes.status).toBe(200)
      const kin = (await kinRes.json()) as {
        root: { id: string; alive: boolean }
        sections: Record<string, Array<Record<string, unknown>>>
      }
      expect(kin['root']['id']).toBe('person-000001')
      for (const sectionName of ['parents', 'grandparents', 'partners', 'siblings', 'children']) {
        expect(Array.isArray(kin['sections'][sectionName])).toBe(true)
      }
      // nodes carry the rendering payload
      for (const node of [...kin['sections']['parents'], ...kin['sections']['children']]) {
        expect(typeof node['id']).toBe('string')
        expect(typeof node['alive']).toBe('boolean')
        expect(typeof node['ageYears']).toBe('number')
      }
    } finally {
      // RT6-B5: same drain discipline as the shared afterAll — an unawaited
      // close over live keep-alive sockets resurfaces the ECONNRESET flake
      srv.closeIdleConnections()
      await new Promise<void>((resolve) => srv.close(() => resolve()))
    }
  }, 90_000)
})
