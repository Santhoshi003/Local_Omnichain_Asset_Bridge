const assert = require("assert");
const path = require("path");
const dotenv = require("dotenv");
const { ethers } = require("ethers");

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", ".env.deployments") });

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

async function waitFor(label, fn, timeoutMs = 90000, intervalMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await fn();
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timeout waiting for ${label}`);
}

async function mine(provider, blocks) {
  for (let i = 0; i < blocks; i++) {
    await provider.send("evm_mine", []);
  }
}

async function main() {
  const providerA = new ethers.JsonRpcProvider(required("CHAIN_A_RPC_URL"));
  const providerB = new ethers.JsonRpcProvider(required("CHAIN_B_RPC_URL"));

  const deployer = new ethers.Wallet(
    required("DEPLOYER_PRIVATE_KEY"),
    providerA,
  );
  const user = new ethers.Wallet(required("USER_PRIVATE_KEY"), providerA);
  const userB = user.connect(providerB);

  const vault = new ethers.Contract(
    required("CHAIN_A_VAULT_TOKEN"),
    [
      "function transfer(address to, uint256 amount) external returns (bool)",
      "function balanceOf(address) external view returns (uint256)",
      "function approve(address spender, uint256 amount) external returns (bool)",
    ],
    deployer,
  );

  const bridgeLock = new ethers.Contract(
    required("CHAIN_A_BRIDGE_LOCK"),
    [
      "function lock(uint256 amount) external",
      "function paused() external view returns (bool)",
      "event Locked(address indexed user, uint256 amount, uint256 nonce)",
    ],
    user,
  );

  const wrapped = new ethers.Contract(
    required("CHAIN_B_WRAPPED_VAULT_TOKEN"),
    [
      "function balanceOf(address) external view returns (uint256)",
      "function totalSupply() external view returns (uint256)",
    ],
    userB,
  );

  const bridgeMint = new ethers.Contract(
    required("CHAIN_B_BRIDGE_MINT"),
    ["function burn(uint256 amount) external"],
    userB,
  );

  const govVoting = new ethers.Contract(
    required("CHAIN_B_GOV_VOTING"),
    [
      "function createProposal(bytes data, uint256 votingPeriodBlocks) external returns (uint256)",
      "function vote(uint256 proposalId, bool support) external",
      "function finalize(uint256 proposalId) external",
    ],
    userB,
  );

  const lockAmount = ethers.parseEther("100");

  await (await vault.transfer(user.address, ethers.parseEther("150"))).wait();
  await (
    await vault.connect(user).approve(await bridgeLock.getAddress(), lockAmount)
  ).wait();

  const userVaultBeforeLock = await vault.balanceOf(user.address);
  await (await bridgeLock.lock(lockAmount)).wait();

  await mine(providerA, Number(process.env.CONFIRMATION_DEPTH || 3));

  await waitFor("mint on chain B", async () => {
    const bal = await wrapped.balanceOf(user.address);
    return bal >= lockAmount;
  });

  const userVaultAfterLock = await vault.balanceOf(user.address);
  assert.equal(
    (userVaultBeforeLock - userVaultAfterLock).toString(),
    lockAmount.toString(),
  );

  const bridgeVaultBal = await vault.balanceOf(await bridgeLock.getAddress());
  const wrappedSupplyAfterMint = await wrapped.totalSupply();
  assert.equal(bridgeVaultBal.toString(), wrappedSupplyAfterMint.toString());

  const wrappedBeforeBurn = await wrapped.balanceOf(user.address);
  await (await bridgeMint.burn(lockAmount)).wait();
  await mine(providerB, Number(process.env.CONFIRMATION_DEPTH || 3));

  await waitFor("unlock on chain A", async () => {
    const current = await vault.balanceOf(user.address);
    return current >= userVaultBeforeLock;
  });

  const wrappedAfterBurn = await wrapped.balanceOf(user.address);
  assert.equal(
    (wrappedBeforeBurn - wrappedAfterBurn).toString(),
    lockAmount.toString(),
  );

  const bridgeVaultAfterBurn = await vault.balanceOf(
    await bridgeLock.getAddress(),
  );
  const wrappedSupplyAfterBurn = await wrapped.totalSupply();
  assert.equal(
    bridgeVaultAfterBurn.toString(),
    wrappedSupplyAfterBurn.toString(),
  );

  const smallLock = ethers.parseEther("10");
  await (
    await vault.connect(user).approve(await bridgeLock.getAddress(), smallLock)
  ).wait();
  await (await bridgeLock.lock(smallLock)).wait();
  await mine(providerA, Number(process.env.CONFIRMATION_DEPTH || 3));

  await waitFor("mint for governance voting", async () => {
    const bal = await wrapped.balanceOf(user.address);
    return bal >= smallLock;
  });

  const bridgeLockIface = new ethers.Interface([
    "function pauseFromGovernance() external",
  ]);
  const pauseData = bridgeLockIface.encodeFunctionData("pauseFromGovernance");
  await (await govVoting.createProposal(pauseData, 2)).wait();
  await (await govVoting.vote(0, true)).wait();

  await mine(providerB, 3);
  await (await govVoting.finalize(0)).wait();
  await mine(providerB, Number(process.env.CONFIRMATION_DEPTH || 3));

  await waitFor("bridge pause action", async () => bridgeLock.paused());

  let pausedRevert = false;
  try {
    await bridgeLock.lock(1n);
  } catch {
    pausedRevert = true;
  }
  assert(pausedRevert, "lock should revert when bridge is paused");

  console.log("integration.e2e.js passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
