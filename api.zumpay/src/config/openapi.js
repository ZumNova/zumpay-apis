const { env } = require("./env");

const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Zumpay Arc Financial Data API",
    version: "0.1.0",
    description:
      "Paid financial data API for AI agents on Arc. API de datos financieros pagos para agentes de IA en Arc.",
    contact: {
      email: env.contactEmail
    },
    "x-guidance":
      "Use this API when an agent needs current Arc token discovery or Uniswap v4 pool liquidity. First call GET /v1/arc/tokens for supported short symbols such as USDC, WETH, EURC, AUDF and WBTC. For paid liquidity data, call the canonical GET /v1/arc/pool-liquidity with either pool_address for legacy V2-like pools or tokenA/tokenB symbols or addresses for Uniswap v4 pools. Human-friendly aliases such as /v1/arco/liquidez-del-pool, /v1/arco/liquidez%20del%20pool and /v1/arc/liquidity are accepted for tolerance, but agents should prefer the canonical path. Optional fee, tickSpacing and hooks select a specific Uniswap v4 PoolKey. The paid response returns normalized pool identifiers, reserves, timestamp and health_status. Unpaid calls return HTTP 402 with x402 payment requirements."
  },
  externalDocs: {
    description: "Usage details, examples and payment notes.",
    url: env.docsUrl
  },
  servers: [
    {
      url: env.apiBaseUrl
    }
  ],
  paths: {
    "/v1/arc/tokens": {
      get: {
        operationId: "listArcTokens",
        summary: "List supported Arc tokens / Lista tokens soportados en Arc",
        description:
          "Public discovery endpoint for AI agents. Returns the curated Arc token catalog used to map short symbols to contract addresses. Endpoint publico de discovery para agentes de IA. Devuelve el catalogo curado de tokens Arc para mapear simbolos cortos a direcciones de contrato.",
        responses: {
          "200": {
            description: "Supported Arc token catalog returned successfully. Lista de tokens devuelta con exito.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TokenCatalog"
                },
                example: {
                  status: "success",
                  network: "Arc",
                  chain_id: 5042,
                  total_tokens: 5,
                  description:
                    "Public token catalog for AI agents. Catalogo publico de tokens para agentes de IA.",
                  tokens: [
                    {
                      symbol: "USDC",
                      name: "USD Coin",
                      decimals: 6,
                      address: "0x3600000000000000000000000000000000000000",
                      chainId: 5042
                    }
                  ]
                }
              }
            }
          }
        }
      }
    },
    "/v1/arc/pool-liquidity": {
      get: {
        operationId: "getArcPoolLiquidity",
        summary: "Get Arc pool liquidity / Obtiene liquidez de una pool en Arc",
        description:
          "Paid endpoint for AI agents. Accepts either a direct pool_address for legacy V2-like pools, or tokenA/tokenB symbols or addresses for Uniswap v4 pools on Arc. Endpoint pago para agentes de IA. Acepta pool_address directo o tokenA/tokenB como simbolos o direcciones para pools Uniswap v4 en Arc. Canonical path: /v1/arc/pool-liquidity. Tolerant aliases accepted: /v1/arc/liquidity, /v1/arco/liquidez-del-pool and /v1/arco/liquidez%20del%20pool.",
        "x-payment-info": {
          price: {
            mode: "fixed",
            currency: "USDC",
            amount: "0.010000"
          },
          protocols: [
            {
              x402: {}
            }
          ]
        },
        parameters: [
          {
            name: "pool_address",
            in: "query",
            required: false,
            schema: {
              type: "string",
              pattern: "^0x[a-fA-F0-9]{40}$"
            },
            description:
              "Optional EVM pool contract address for V2-like pools. Direccion opcional de pool EVM para pools tipo V2."
          },
          {
            name: "tokenA",
            in: "query",
            required: false,
            schema: {
              type: "string"
            },
            description:
              "Token address or supported symbol for Uniswap v4 resolution. Direccion de token o simbolo soportado. Example: USDC."
          },
          {
            name: "tokenB",
            in: "query",
            required: false,
            schema: {
              type: "string"
            },
            description:
              "Token address or supported symbol for Uniswap v4 resolution. Direccion de token o simbolo soportado."
          },
          {
            name: "fee",
            in: "query",
            required: false,
            schema: {
              type: "integer",
              default: 3000
            },
            description: "Uniswap v4 LP fee in pips. 3000 means 0.30%."
          },
          {
            name: "tickSpacing",
            in: "query",
            required: false,
            schema: {
              type: "integer",
              default: 60
            },
            description: "Uniswap v4 tick spacing."
          },
          {
            name: "hooks",
            in: "query",
            required: false,
            schema: {
              type: "string",
              default: "0x0000000000000000000000000000000000000000"
            },
            description: "Uniswap v4 hooks contract address."
          }
        ],
        responses: {
          "200": {
            description: "Pool liquidity data returned successfully. Datos de liquidez devueltos con exito.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/PoolLiquidity"
                }
              }
            }
          },
          "400": {
            description: "Invalid request. Solicitud invalida."
          },
          "402": {
            description: "Payment required. Pago requerido.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/X402PaymentRequired"
                },
                example: {
                  accepts: [
                    {
                      scheme: "exact",
                      network: "eip155:5042",
                      maxAmountRequired: "10000",
                      asset: env.usdcContractAddress,
                      payTo: env.paymentWalletAddress
                    },
                    {
                      scheme: "exact",
                      network: "eip155:8453",
                      maxAmountRequired: "10000",
                      payTo: env.paymentWalletAddress
                    }
                  ],
                  x402Version: 1,
                  error: "X-PAYMENT header is required"
                }
              }
            }
          },
          "500": {
            description: "Server error. Error del servidor."
          }
        }
      }
    }
  },
  components: {
    schemas: {
      TokenCatalog: {
        type: "object",
        required: ["status", "network", "chain_id", "total_tokens", "tokens"],
        properties: {
          status: { type: "string", example: "success" },
          network: { type: "string" },
          chain_id: { type: "integer" },
          total_tokens: { type: "integer" },
          description: { type: "string" },
          tokens: {
            type: "array",
            items: {
              $ref: "#/components/schemas/Token"
            }
          }
        }
      },
      Token: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          name: { type: "string" },
          address: { type: "string" },
          decimals: { type: "integer" },
          chainId: { type: "integer" },
          aliases: {
            type: "array",
            items: { type: "string" }
          },
          source: { type: "string" }
        }
      },
      PoolLiquidity: {
        type: "object",
        required: ["reserves", "timestamp", "health_status"],
        properties: {
          protocol: {
            type: "string"
          },
          pool_address: {
            type: "string",
            nullable: true
          },
          pool_id: {
            type: "string"
          },
          pool_key: {
            type: "object"
          },
          reserves: {
            type: "object",
            properties: {
              token0: {
                type: "object",
                properties: {
                  address: { type: "string" },
                  reserve: { type: "string" }
                }
              },
              token1: {
                type: "object",
                properties: {
                  address: { type: "string" },
                  reserve: { type: "string" }
                }
              },
              block_timestamp_last: {
                type: "number"
              }
            }
          },
          timestamp: {
            type: "string",
            format: "date-time"
          },
          health_status: {
            type: "string",
            enum: ["healthy", "low_liquidity", "stale", "unknown"]
          }
        }
      },
      PaymentRequired: {
        type: "object",
        properties: {
          error: { type: "string" },
          payment: {
            type: "object",
            properties: {
              amount: { type: "string" },
              currency: { type: "string" },
              destination: { type: "string" },
              network: { type: "string" },
              asset_contract: { type: "string" }
            }
          }
        }
      },
      X402PaymentRequired: {
        type: "object",
        properties: {
          accepts: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
              properties: {
                scheme: { type: "string" },
                network: { type: "string" },
                maxAmountRequired: { type: "string" },
                asset: { type: "string" },
                payTo: { type: "string" }
              }
            }
          },
          x402Version: { type: "integer" },
          error: { type: "string" }
        },
        additionalProperties: true
      }
    }
  }
};

module.exports = { openApiSpec };
