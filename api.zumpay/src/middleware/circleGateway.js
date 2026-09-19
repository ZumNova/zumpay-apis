const { env } = require("../config/env");

let gatewayMiddlewarePromise;

async function getGatewayMiddleware() {
  if (!gatewayMiddlewarePromise) {
    gatewayMiddlewarePromise = import("@circle-fin/x402-batching/server").then(
      ({ createGatewayMiddleware }) => {
        const gateway = createGatewayMiddleware({
          sellerAddress: env.paymentWalletAddress,
          arcPrivateMainnet: true,
          description:
            "Zumpay Arc pool liquidity data for AI agents. Datos de liquidez de pools Arc para agentes de IA."
        });

        return gateway.require(`$${env.paymentPriceUsd}`);
      }
    );
  }

  return gatewayMiddlewarePromise;
}

async function requireCirclePayment(req, res, next) {
  try {
    const middleware = await getGatewayMiddleware();
    return middleware(req, res, next);
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireCirclePayment };
