# BEST V4 ROBINHOOD API

Paid x402 microservice for bots and AI agents that need a compact feed of active Robinhood V4 pools.

## Endpoint

```text
GET /v1/robinhood/v4/best-pools
```

Optional query params:

- `limit`: 1..20, default 5
- `min_volume_24h_usd`: default 0
- `min_liquidity_usd`: default 0
- `token`: symbol, name or address

## Local run

```bash
npm install
npm run dev
```

## Deploy

Use Vercel with the custom domain:

```text
best-v4-robinhood.zumpay.com.ar
```
