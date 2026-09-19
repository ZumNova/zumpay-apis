# Zumpay Arc API

Express API for AI agents requesting paid financial data from Arc pools.

## Endpoints

- `GET /openapi.json`
- `GET /v1/arc/tokens`
- `GET /v1/arc/pool-liquidity?pool_address=0x...`
- `GET /v1/arc/pool-liquidity?tokenA=USDC&tokenB=0x...&fee=3000&tickSpacing=60`

Requests to `/v1/arc/pool-liquidity` must include either `x-payment` or `authorization`.
Without payment, Circle Gateway x402 returns `402 Payment Required` with a `PAYMENT-REQUIRED` challenge header.

## Local Development

```bash
cp .env.example .env
npm install
npm run dev
```

## Vercel

Deploy this folder as its own Vercel project root:

```bash
vercel --cwd api.zumpay
```

Set these environment variables in Vercel:

- `API_BASE_URL`
- `ARC_RPC_URL`
- `PAYMENT_WALLET_ADDRESS`
- `PAYMENT_PRICE_USD`
- `CONTACT_EMAIL`
- `DOCS_URL`
- `USDC_CONTRACT_ADDRESS`
- `UNISWAP_V4_POOL_MANAGER`
- `UNISWAP_V4_RESERVES_LENS`
- `DEFAULT_UNISWAP_FEE`
- `DEFAULT_UNISWAP_TICK_SPACING`
- `DEFAULT_UNISWAP_HOOKS`
