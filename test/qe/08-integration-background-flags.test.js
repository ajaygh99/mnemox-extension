// QE Suite 08 — integration: background.js message handlers & feature flags
// Runs the real background.js in an isolated vm context with mocked
// chrome.storage.local / fetch, driving it exactly the way content.js's
// chrome.runtime.sendMessage calls do in production.

const { describe, it, expect } = require('./lib/framework');
const { createBackgroundWorld, createStorage, createFetchMock } = require('./lib/harness');

// background.js pings API_BASE + '/health' once on load (warmupBackend(), to
// cut cold-start latency) -- real, intentional, documented behavior, but it
// means fetchMock.calls always has 1 unrelated entry before a test does
// anything. Filter it out so assertions test the thing they mean to test.
function callsTo(fetchMock, pathFragment) {
  return fetchMock.calls.filter(c => c.url.includes(pathFragment));
}

module.exports = async function run() {

  await describe('Integration: background.js — feature flag defaults', async () => {

    await it('FLAG_TEST reports all documented flags with their shipped defaults', async () => {
      const bg = createBackgroundWorld(createStorage(), createFetchMock({ body: {} }));
      const resp = await bg.dispatch({ type: 'FLAG_TEST' });
      expect(resp.ok).toBe(true);
      expect(resp.flags.TOKEN_COUNTER).toBe(true);
      expect(resp.flags.PROMPT_COACHING).toBe(true);
      expect(resp.flags.PAYWALL).toBe(false);
      expect(resp.flags.TRUST_SCORING).toBe(true);
    });

    await it('TRACE_LOGGING defaults to false (privacy fix regression -- see QE_REPORT.md)', async () => {
      const bg = createBackgroundWorld(createStorage(), createFetchMock({ body: {} }));
      const resp = await bg.dispatch({ type: 'FLAG_TEST' });
      expect(resp.flags.TRACE_LOGGING).toBe(false);
    });

    await it('MEMORY_CONSISTENCY defaults to false (Step 5 opt-in)', async () => {
      const bg = createBackgroundWorld(createStorage(), createFetchMock({ body: {} }));
      const resp = await bg.dispatch({ type: 'FLAG_TEST' });
      expect(resp.flags.MEMORY_CONSISTENCY).toBe(false);
    });

    await it('a flag explicitly stored in chrome.storage.local overrides its default', async () => {
      const storage = createStorage({ TRACE_LOGGING: true });
      const bg = createBackgroundWorld(storage, createFetchMock({ body: {} }));
      const resp = await bg.dispatch({ type: 'FLAG_TEST' });
      expect(resp.flags.TRACE_LOGGING).toBe(true);
    });
  });

  await describe('Integration: background.js — simple flag-gated handlers', async () => {
    await it('TOKEN_COUNT returns the TOKEN_COUNTER flag state', async () => {
      const bg = createBackgroundWorld(createStorage(), createFetchMock({ body: {} }));
      const resp = await bg.dispatch({ type: 'TOKEN_COUNT' });
      expect(resp).toEqual({ ok: true, enabled: true });
    });

    await it('ANALYZE_PROMPT returns the PROMPT_COACHING flag state', async () => {
      const bg = createBackgroundWorld(createStorage(), createFetchMock({ body: {} }));
      const resp = await bg.dispatch({ type: 'ANALYZE_PROMPT' });
      expect(resp).toEqual({ ok: true, enabled: true });
    });

    await it('ENTITLEMENT_CHECK reports free tier with paywallEnabled=false by default', async () => {
      const bg = createBackgroundWorld(createStorage(), createFetchMock({ body: {} }));
      const resp = await bg.dispatch({ type: 'ENTITLEMENT_CHECK' });
      expect(resp).toEqual({ ok: true, tier: 'free', paywallEnabled: false });
    });

    await it('GET_UUID returns null before onInstalled has ever assigned one', async () => {
      const bg = createBackgroundWorld(createStorage(), createFetchMock({ body: {} }));
      const resp = await bg.dispatch({ type: 'GET_UUID' });
      expect(resp).toEqual({ ok: true, uuid: null });
    });

    await it('onInstalled assigns a UUID exactly once, persisted in storage.local', async () => {
      const storage = createStorage();
      const bg = createBackgroundWorld(storage, createFetchMock({ body: {} }));
      bg.triggerInstalled();
      await new Promise(r => setTimeout(r, 10));
      const resp = await bg.dispatch({ type: 'GET_UUID' });
      expect(resp.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    await it('unknown message types get a clean error response, not a thrown exception', async () => {
      const bg = createBackgroundWorld(createStorage(), createFetchMock({ body: {} }));
      const resp = await bg.dispatch({ type: 'SOME_MADE_UP_TYPE' });
      expect(resp.ok).toBe(false);
      expect(resp.error).toContain('SOME_MADE_UP_TYPE');
    });
  });

  await describe('Integration: RESPONSE_SCORED (trace logging) gating', async () => {
    await it('with TRACE_LOGGING off (default), no fetch call is made and logged:false is reported', async () => {
      const fetchMock = createFetchMock({ body: {} });
      const bg = createBackgroundWorld(createStorage(), fetchMock);
      const resp = await bg.dispatch({
        type: 'RESPONSE_SCORED',
        result: { trustScore: 80, grade: 'A', quality: 'High confidence', platform: 'claude.ai', text: 'a response' },
        promptText: 'a prompt',
      });
      expect(resp).toEqual({ ok: true, logged: false });
      expect(callsTo(fetchMock, '/traces')).toHaveLength(0);
    });

    await it('with TRACE_LOGGING on, a fetch to /traces is made with the correct payload shape', async () => {
      const fetchMock = createFetchMock({ body: {} });
      const storage = createStorage({ TRACE_LOGGING: true, mnemox_uuid: 'test-uuid-123' });
      const bg = createBackgroundWorld(storage, fetchMock);
      const resp = await bg.dispatch({
        type: 'RESPONSE_SCORED',
        result: { trustScore: 80, trustScoreNormalized: 0.8, grade: 'A', quality: 'High confidence', platform: 'claude.ai', text: 'a full response body', tokenEstimate: 15 },
        promptText: 'a prompt asking something',
      });
      expect(resp).toEqual({ ok: true, logged: true });
      expect(callsTo(fetchMock, '/traces')).toHaveLength(1);
      const call = callsTo(fetchMock, '/traces')[0];
      expect(call.url).toContain('/traces');
      expect(call.body.tool_name).toBe('claude');
      expect(call.body.prompt_text).toBe('a prompt asking something');
      expect(call.body.response_text).toBe('a full response body');
      expect(call.body.trust_score).toBe(0.8);
      expect(call.body.mnemox_uuid).toBe('test-uuid-123');
    });

    await it('an unrecognized platform hostname is not logged (toolName lookup miss)', async () => {
      const fetchMock = createFetchMock({ body: {} });
      const storage = createStorage({ TRACE_LOGGING: true });
      const bg = createBackgroundWorld(storage, fetchMock);
      const resp = await bg.dispatch({
        type: 'RESPONSE_SCORED',
        result: { trustScore: 50, platform: 'some-unknown-site.example.com', text: 'x' },
        promptText: 'y',
      });
      expect(resp.logged).toBe(false);
      expect(callsTo(fetchMock, '/traces')).toHaveLength(0);
    });

    await it('rapid repeated RESPONSE_SCORED for the same tool within the cooldown window only logs once', async () => {
      const fetchMock = createFetchMock({ body: {} });
      const storage = createStorage({ TRACE_LOGGING: true });
      const bg = createBackgroundWorld(storage, fetchMock);
      const msg = { type: 'RESPONSE_SCORED', result: { trustScore: 60, platform: 'claude.ai', text: 'x' }, promptText: 'y' };

      const r1 = await bg.dispatch(msg);
      const r2 = await bg.dispatch(msg);
      expect(r1.logged).toBe(true);
      expect(r2.logged).toBe(false);
      expect(callsTo(fetchMock, '/traces')).toHaveLength(1);
    });

    await it('a fetch failure during trace logging is swallowed silently, does not reject the caller', async () => {
      const fetchMock = createFetchMock(new Error('network down'));
      const storage = createStorage({ TRACE_LOGGING: true });
      const bg = createBackgroundWorld(storage, fetchMock);
      const resp = await bg.dispatch({
        type: 'RESPONSE_SCORED',
        result: { trustScore: 60, platform: 'claude.ai', text: 'x' },
        promptText: 'y',
      });
      // sendResponse fires before the fetch promise settles either way --
      // the important thing is dispatch() resolves and the extension keeps working.
      expect(resp.ok).toBe(true);
    });
  });

  await describe('Integration: MEMORY_CHECK (Step 5 opt-in) gating', async () => {
    await it('with MEMORY_CONSISTENCY off (default), returns {enabled:false} and makes NO network call', async () => {
      const fetchMock = createFetchMock({ body: {} });
      const bg = createBackgroundWorld(createStorage(), fetchMock);
      const resp = await bg.dispatch({ type: 'MEMORY_CHECK', text: 'an AI response to check' });
      expect(resp).toEqual({ ok: true, enabled: false });
      expect(callsTo(fetchMock, '/search')).toHaveLength(0);
    });

    await it('with MEMORY_CONSISTENCY on, calls POST /search with the response text as the query', async () => {
      const fetchMock = createFetchMock({ body: { results: [{ score: 0.9 }, { score: 0.7 }] } });
      const storage = createStorage({ MEMORY_CONSISTENCY: true, mnemox_uuid: 'u-1' });
      const bg = createBackgroundWorld(storage, fetchMock);
      const resp = await bg.dispatch({ type: 'MEMORY_CHECK', text: 'response text to compare' });

      expect(resp.enabled).toBe(true);
      expect(resp.available).toBe(true);
      expect(resp.count).toBe(2);
      expect(resp.avgSimilarity).toBe(0.8);
      const searchCalls = callsTo(fetchMock, '/search');
      expect(searchCalls).toHaveLength(1);
      expect(searchCalls[0].body.query).toBe('response text to compare');
      expect(searchCalls[0].body.user_id).toBe('u-1');
    });

    await it('defensively handles the "memories" response-shape variant', async () => {
      const fetchMock = createFetchMock({ body: { memories: [{ similarity: 0.5 }] } });
      const bg = createBackgroundWorld(createStorage({ MEMORY_CONSISTENCY: true }), fetchMock);
      const resp = await bg.dispatch({ type: 'MEMORY_CHECK', text: 'x' });
      expect(resp.available).toBe(true);
      expect(resp.avgSimilarity).toBe(0.5);
    });

    await it('defensively handles a bare-array response-shape variant', async () => {
      const fetchMock = createFetchMock({ body: [{ score: 0.3 }, { score: 0.9 }] });
      const bg = createBackgroundWorld(createStorage({ MEMORY_CONSISTENCY: true }), fetchMock);
      const resp = await bg.dispatch({ type: 'MEMORY_CHECK', text: 'x' });
      expect(resp.count).toBe(2);
    });

    await it('an unrecognized/empty response shape reports available:false instead of throwing', async () => {
      const fetchMock = createFetchMock({ body: { unexpected: 'shape' } });
      const bg = createBackgroundWorld(createStorage({ MEMORY_CONSISTENCY: true }), fetchMock);
      const resp = await bg.dispatch({ type: 'MEMORY_CHECK', text: 'x' });
      expect(resp.available).toBe(false);
      expect(resp.count).toBe(0);
    });

    await it('a backend network failure is caught and reported as available:false, not thrown', async () => {
      const fetchMock = createFetchMock(new Error('DNS failure'));
      const bg = createBackgroundWorld(createStorage({ MEMORY_CONSISTENCY: true }), fetchMock);
      const resp = await bg.dispatch({ type: 'MEMORY_CHECK', text: 'x' });
      expect(resp.enabled).toBe(true);
      expect(resp.available).toBe(false);
      expect(resp.error).toBeDefined();
    });

    await it('empty/missing response text short-circuits before any fetch is attempted', async () => {
      const fetchMock = createFetchMock({ body: {} });
      const bg = createBackgroundWorld(createStorage({ MEMORY_CONSISTENCY: true }), fetchMock);
      const resp = await bg.dispatch({ type: 'MEMORY_CHECK', text: '' });
      expect(resp.available).toBe(false);
      expect(callsTo(fetchMock, '/search')).toHaveLength(0);
    });

    await it('a 429/500 HTTP error status is treated as a failure, not parsed as success', async () => {
      const fetchMock = createFetchMock({ ok: false, status: 500, body: {} });
      const bg = createBackgroundWorld(createStorage({ MEMORY_CONSISTENCY: true }), fetchMock);
      const resp = await bg.dispatch({ type: 'MEMORY_CHECK', text: 'x' });
      expect(resp.available).toBe(false);
    });
  });
};
