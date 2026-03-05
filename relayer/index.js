const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { ethers } = require("ethers");

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", ".env.deployments") });

const bridgeLockAbi = [
  "event Locked(address indexed user, uint256 amount, uint256 nonce)",
  "function unlock(address user, uint256 amount, uint256 nonce) external",
];

const bridgeMintAbi = [
  "event Burned(address indexed user, uint256 amount, uint256 nonce)",
  "function mintWrapped(address user, uint256 amount, uint256 nonce) external",
];

const governanceVotingAbi = [
  "event ProposalPassed(uint256 proposalId, bytes data)",
];

const governanceEmergencyAbi = [
  "function executeEmergency(bytes data) external",
  "function pauseBridge() external",
];

class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = {
      processed: {},
      lastBlocks: {
        chainA: -1,
        chainB: -1,
      },
    };
  }

  load() {
    if (fs.existsSync(this.filePath)) {
      this.state = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    } else {
      this.save();
    }
    return this.state;
  }

  save() {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    fs.renameSync(tmp, this.filePath);
  }

  has(key) {
    return Boolean(this.state.processed[key]);
  }

  setProcessed(key) {
    this.state.processed[key] = true;
    this.save();
  }

  setLastBlock(chain, block) {
    this.state.lastBlocks[chain] = block;
    this.save();
  }
}

function required(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

async function retry(fn, label, attempts = 5, delayMs = 2000) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.error(
        `[${label}] attempt ${attempt}/${attempts} failed:`,
        error.message,
      );
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

async function main() {
  const config = {
    chainARpc: required("CHAIN_A_RPC_URL"),
    chainBRpc: required("CHAIN_B_RPC_URL"),
    privateKey: required("DEPLOYER_PRIVATE_KEY"),
    confirmationDepth: Number(process.env.CONFIRMATION_DEPTH || 3),
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 4000),
    dbPath: process.env.DB_PATH || "./data/processed_nonces.json",
    bridgeLockAddress: required("CHAIN_A_BRIDGE_LOCK"),
    governanceEmergencyAddress: required("CHAIN_A_GOV_EMERGENCY"),
    bridgeMintAddress: required("CHAIN_B_BRIDGE_MINT"),
    governanceVotingAddress: required("CHAIN_B_GOV_VOTING"),
  };

  const store = new JsonStore(
    path.isAbsolute(config.dbPath)
      ? config.dbPath
      : path.join(__dirname, config.dbPath),
  );
  store.load();

  const providerA = new ethers.JsonRpcProvider(config.chainARpc);
  const providerB = new ethers.JsonRpcProvider(config.chainBRpc);

  await retry(() => providerA.getBlockNumber(), "connect-chain-a");
  await retry(() => providerB.getBlockNumber(), "connect-chain-b");
  console.log("Connected to both chains");

  const walletA = new ethers.Wallet(config.privateKey, providerA);
  const walletB = new ethers.Wallet(config.privateKey, providerB);

  const bridgeLockRead = new ethers.Contract(
    config.bridgeLockAddress,
    bridgeLockAbi,
    providerA,
  );
  const bridgeMintRead = new ethers.Contract(
    config.bridgeMintAddress,
    bridgeMintAbi,
    providerB,
  );
  const governanceVotingRead = new ethers.Contract(
    config.governanceVotingAddress,
    governanceVotingAbi,
    providerB,
  );

  const bridgeLockWrite = new ethers.Contract(
    config.bridgeLockAddress,
    bridgeLockAbi,
    walletA,
  );
  const bridgeMintWrite = new ethers.Contract(
    config.bridgeMintAddress,
    bridgeMintAbi,
    walletB,
  );
  const governanceEmergencyWrite = new ethers.Contract(
    config.governanceEmergencyAddress,
    governanceEmergencyAbi,
    walletA,
  );

  let inFlight = false;

  async function processLocked(log) {
    const [user, amount, nonce] = log.args;
    const key = `locked:${nonce.toString()}`;
    if (store.has(key)) return;

    await retry(async () => {
      const tx = await bridgeMintWrite.mintWrapped(user, amount, nonce);
      await tx.wait();
    }, `mintWrapped nonce=${nonce.toString()}`);

    store.setProcessed(key);
    console.log(`Processed Locked nonce=${nonce.toString()}`);
  }

  async function processBurned(log) {
    const [user, amount, nonce] = log.args;
    const key = `burned:${nonce.toString()}`;
    if (store.has(key)) return;

    await retry(async () => {
      const tx = await bridgeLockWrite.unlock(user, amount, nonce);
      await tx.wait();
    }, `unlock nonce=${nonce.toString()}`);

    store.setProcessed(key);
    console.log(`Processed Burned nonce=${nonce.toString()}`);
  }

  async function processProposal(log) {
    const [proposalId, data] = log.args;
    const key = `proposal:${proposalId.toString()}`;
    if (store.has(key)) return;

    await retry(async () => {
      const tx = await governanceEmergencyWrite.executeEmergency(data);
      await tx.wait();
    }, `executeEmergency proposalId=${proposalId.toString()}`);

    store.setProcessed(key);
    console.log(`Processed ProposalPassed proposalId=${proposalId.toString()}`);
  }

  async function poll() {
    if (inFlight) return;
    inFlight = true;
    try {
      const latestA = await providerA.getBlockNumber();
      const latestB = await providerB.getBlockNumber();
      const safeA = latestA - config.confirmationDepth;
      const safeB = latestB - config.confirmationDepth;

      if (safeA >= 0) {
        const fromA =
          store.state.lastBlocks.chainA < 0
            ? 0
            : store.state.lastBlocks.chainA + 1;
        if (safeA >= fromA) {
          const lockedLogs = await bridgeLockRead.queryFilter(
            bridgeLockRead.filters.Locked(),
            fromA,
            safeA,
          );
          for (const log of lockedLogs) {
            await processLocked(log);
          }
          store.setLastBlock("chainA", safeA);
        }
      }

      if (safeB >= 0) {
        const fromB =
          store.state.lastBlocks.chainB < 0
            ? 0
            : store.state.lastBlocks.chainB + 1;
        if (safeB >= fromB) {
          const burnedLogs = await bridgeMintRead.queryFilter(
            bridgeMintRead.filters.Burned(),
            fromB,
            safeB,
          );
          for (const log of burnedLogs) {
            await processBurned(log);
          }

          const proposalLogs = await governanceVotingRead.queryFilter(
            governanceVotingRead.filters.ProposalPassed(),
            fromB,
            safeB,
          );
          for (const log of proposalLogs) {
            await processProposal(log);
          }

          store.setLastBlock("chainB", safeB);
        }
      }
    } catch (error) {
      console.error("Poll failed:", error.message);
    } finally {
      inFlight = false;
    }
  }

  await poll();
  setInterval(poll, config.pollIntervalMs);
}

main().catch((error) => {
  console.error("Relayer fatal error:", error);
  process.exit(1);
});
