const { env } = require("./env");

const paymentMetadata = {
  error: "payment_required",
  message: "This endpoint requires an x402 payment.",
  accepted_headers: ["x-payment"],
  protocols: [{ x402: {} }],
  payment: {
    mode: "fixed",
    amount: env.paymentPriceUsd,
    currency: "USDC",
    destination: env.paymentWalletAddress,
    networks: ["Arc", "Base", "Polygon", "Arbitrum", "Ethereum"],
    asset_contract: env.usdcContractAddress
  }
};

module.exports = { paymentMetadata };
