require("@nomicfoundation/hardhat-ethers");
require("dotenv").config();

const PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

module.exports = {
  solidity: "0.8.24",
  networks: {
    hardhat: {
      chainId: 31337,
    },
    chainA: {
      url: process.env.CHAIN_A_RPC_URL || "http://127.0.0.1:8545",
      chainId: Number(process.env.CHAIN_A_CHAIN_ID || 1111),
      accounts: [PRIVATE_KEY],
    },
    chainB: {
      url: process.env.CHAIN_B_RPC_URL || "http://127.0.0.1:9545",
      chainId: Number(process.env.CHAIN_B_CHAIN_ID || 2222),
      accounts: [PRIVATE_KEY],
    },
  },
};
