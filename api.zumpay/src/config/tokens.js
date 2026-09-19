const { ethers } = require("ethers");

const arcTokens = require("../data/arcTokens.json");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function getTokenRegistry() {
  return getSupportedTokens().reduce(
    (registry, token) => {
      registry[token.symbol.toUpperCase()] = token.address;

      for (const alias of token.aliases || []) {
        registry[alias.toUpperCase()] = token.address;
      }

      return registry;
    },
    { NATIVE: ZERO_ADDRESS }
  );
}

function getSupportedTokens() {
  return arcTokens.map((token) => ({
    ...token,
    address: ethers.getAddress(token.address)
  }));
}

module.exports = { ZERO_ADDRESS, getSupportedTokens, getTokenRegistry };
