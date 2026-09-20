# RH V4 Meme Radar API

Paid x402 microservice for Robinhood V4 meme-pool discovery and fast high-risk bot signals.

## Endpoints

```text
GET /v1/robinhood/v4/meme-pools
GET /v1/robinhood/v4/meme-momentum
GET /v1/robinhood/v4/new-meme-pools
GET /v1/robinhood/v4/meme-pool-check?pool_id=0x...
```

## Optional Configuration

Set `MEME_POOLS_JSON` with an array of curated meme pools.

```json
[
  {
    "symbol": "MEME",
    "name": "Meme Token",
    "pool_id": "0x...",
    "paired_with": "USDG",
    "liquidity_usd": 8400,
    "volume_5m_usd": 2100,
    "tx_count_5m": 37,
    "age_minutes": 14
  }
]
```
