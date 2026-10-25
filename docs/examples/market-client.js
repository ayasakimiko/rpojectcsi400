// Example client for the dorm Market API (Node.js 18+). Copy into your own project.
// The key is read from the MARKET_API_KEY environment variable; never hard-code it or log it.

const BASE_URL = process.env.MARKET_API_URL || "http://localhost:4000/api/market/v1";
const MAX_RETRIES = 3;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export class MarketApiError extends Error {
  constructor(status, code, message, requestId) {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

function apiKey() {
  const key = process.env.MARKET_API_KEY;
  if (!key) throw new Error("Set MARKET_API_KEY before calling the Market API");
  return key;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(method, path, body, headers = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "X-Market-Api-Key": apiKey(),
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return { data, etag: response.headers.get("etag") };
    if (!RETRYABLE_STATUS.has(response.status) || attempt >= MAX_RETRIES) {
      throw new MarketApiError(response.status, data.code, data.message, response.headers.get("x-request-id"));
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    await wait(response.status === 429 && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 500);
  }
}

export const me = async () => (await request("GET", "/me")).data;
export const listStalls = async (page = 1) => (await request("GET", `/stalls?page=${page}`)).data;
export const getStallProducts = async (stallId) => (await request("GET", `/stalls/${stallId}/products`)).data;
export const getProduct = async (productId) => (await request("GET", `/products/${productId}`)).data;
export const updateShopName = async (stallId, shopName) => (await request("PATCH", `/stalls/${stallId}`, { shop_name: shopName })).data;

export async function updateProduct(productId, changes, { version } = {}) {
  const allowed = Object.fromEntries(Object.entries(changes).filter(([key]) => ["name", "price", "quantity"].includes(key)));
  const headers = version === undefined ? {} : { "If-Match": `"${version}"` };
  return (await request("PATCH", `/products/${productId}`, allowed, headers)).data;
}

export const adjustQuantity = async (productId, delta) => (await request("POST", `/products/${productId}/adjust`, { delta })).data;
