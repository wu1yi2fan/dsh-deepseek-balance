/** Authenticated GET route serving the queried DeepSeek API-key account balance. */
const ROUTE_PATH = '/api/deepseek-balance';
/** Documented balance endpoint, relative to the API root. */
const BALANCE_ENDPOINT = '/user/balance';
/** Credential holding the API key used for the query. */
const API_KEY_REF = 'DEEPSEEK_API_KEY';
/** Public API root. */
const BASE_URL = 'https://api.deepseek.com';
/** How long one answered query is reused before the API is asked again. */
const CACHE_TTL_MS = 30_000;
/** Upper bound for one upstream query. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Resolve the API key for one query through the credential service, falling back
 * to the ambient `DEEPSEEK_API_KEY` of the launching process.
 * @param ctx - Host context; `credentials` may be absent in a minimal profile.
 * @returns the key with the source layer that supplied it, or undefined.
 */
async function resolveApiKey(ctx) {
  const credentials = ctx.get('credentials');
  if (credentials !== undefined) {
    const hit = await credentials.resolve(API_KEY_REF);
    if (hit !== undefined && hit.value.length > 0) return { key: hit.value, source: hit.source };
  }
  const ambient = process.env[API_KEY_REF];
  if (typeof ambient === 'string' && ambient.length > 0) return { key: ambient, source: 'env' };
  return undefined;
}

/**
 * Validate one wallet row of the documented response.
 * @param value - decoded `balance_infos` entry.
 * @returns the wallet, or undefined when a required field is missing or mistyped.
 */
function parseWallet(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const { currency, total_balance: total, granted_balance: granted, topped_up_balance: toppedUp } = value;
  if (typeof currency !== 'string' || typeof total !== 'string') return undefined;
  return {
    currency,
    totalBalance: total,
    grantedBalance: typeof granted === 'string' ? granted : null,
    toppedUpBalance: typeof toppedUp === 'string' ? toppedUp : null,
  };
}

/**
 * Parse the documented balance response.
 * @param value - decoded JSON body.
 * @returns display facts, or undefined for a body this plugin cannot read.
 */
function parseBalance(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const { is_available: available, balance_infos: infos } = value;
  if (!Array.isArray(infos)) return undefined;
  return {
    available: available === true,
    wallets: infos.map(parseWallet).filter((wallet) => wallet !== undefined),
  };
}

/**
 * Read one upstream failure body far enough to report it, without echoing a key.
 * @param response - failed upstream response.
 * @returns a short message for the Client.
 */
async function failureMessage(response) {
  const text = await response.text().catch(() => '');
  const trimmed = text.trim().replace(/\s+/gu, ' ').slice(0, 200);
  return trimmed.length > 0 ? trimmed : `HTTP ${response.status} from ${BALANCE_ENDPOINT}`;
}

/**
 * Register the balance route inside Connection's authentication fence and serve
 * one cached, key-free view of the API-key account balance.
 * @param ctx - Host context carrying Connection, credentials, and the route lifetime.
 */
function apply(ctx) {
  /** Last successful view, and the in-flight query later callers await. */
  let cached;
  let pending;

  const load = async () => {
    const resolved = await resolveApiKey(ctx);
    if (resolved === undefined) {
      return { status: 'unconfigured', apiKeyRef: API_KEY_REF, source: null, message: `No ${API_KEY_REF} credential is configured.` };
    }
    let response;
    try {
      response = await fetch(`${BASE_URL}${BALANCE_ENDPOINT}`, {
        headers: { authorization: `Bearer ${resolved.key}`, accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      return { status: 'error', apiKeyRef: API_KEY_REF, source: resolved.source, message: error instanceof Error ? error.message : String(error) };
    }
    if (!response.ok) {
      return {
        status: response.status === 401 || response.status === 403 ? 'unauthorized' : 'error',
        apiKeyRef: API_KEY_REF,
        source: resolved.source,
        message: await failureMessage(response),
      };
    }
    let body;
    try {
      body = await response.json();
    } catch {
      return { status: 'error', apiKeyRef: API_KEY_REF, source: resolved.source, message: 'The balance response was not JSON.' };
    }
    const parsed = parseBalance(body);
    if (parsed === undefined) {
      return { status: 'error', apiKeyRef: API_KEY_REF, source: resolved.source, message: 'The balance response had an unexpected shape.' };
    }
    return { status: 'ready', apiKeyRef: API_KEY_REF, source: resolved.source, queriedAt: Date.now(), ...parsed };
  };

  const current = async (force) => {
    if (!force && cached !== undefined && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
    if (pending === undefined) {
      pending = load()
        .then((value) => {
          if (value.status === 'ready') cached = { at: Date.now(), value };
          return value;
        })
        .finally(() => {
          pending = undefined;
        });
    }
    return pending;
  };

  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const value = await current(new URL(request.url).searchParams.get('refresh') === '1');
      return Response.json(value, { headers: { 'cache-control': 'no-store' } });
    },
  }), 'deepseek-balance: balance route');
}

/** Services required before the route is registered. */
export const inject = ['connection'];

export { apply };
