const assert = require("assert");
const path = require("path");
const { execSync } = require("child_process");
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
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timeout waiting for ${label}`);
}

async function mine(provider, blocks) {
  for (let i = 0; i < blocks; i++) {
    await provider.send("evm_mine", []);
  }
}

function compose(command) {
  execSync(`docker compose ${command}`, {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
  });
}

async function main() {
  const providerA = new ethers.JsonRpcProvider(required("CHAIN_A_RPC_URL"));
  const providerB = new ethers.JsonRpcProvider(required("CHAIN_B_RPC_URL"));

  const deployer = new ethers.Wallet(
    required("DEPLOYER_PRIVATE_KEY"),
    providerA,
  );
  const user = new ethers.Wallet(required("USER_PRIVATE_KEY"), providerA);

  const vault = new ethers.Contract(
    required("CHAIN_A_VAULT_TOKEN"),
    [
      "function transfer(address to, uint256 amount) external returns (bool)",
      "function approve(address spender, uint256 amount) external returns (bool)",
    ],
    deployer,
  );

  const bridgeLock = new ethers.Contract(
    required("CHAIN_A_BRIDGE_LOCK"),
    ["function lock(uint256 amount) external"],
    user,
  );

  const wrapped = new ethers.Contract(
    required("CHAIN_B_WRAPPED_VAULT_TOKEN"),
    ["function balanceOf(address) external view returns (uint256)"],
    providerB,
  );

  compose("stop relayer");

  const amount = ethers.parseEther("5");
  await (await vault.transfer(user.address, amount)).wait();
  await (
    await vault.connect(user).approve(await bridgeLock.getAddress(), amount)
  ).wait();
  await (await bridgeLock.lock(amount)).wait();
  await mine(providerA, Number(process.env.CONFIRMATION_DEPTH || 3));

  compose("start relayer");

  await waitFor("relayer to process missed lock", async () => {
    const bal = await wrapped.balanceOf(user.address);
    return bal >= amount;
  });

  assert(true, "Relayer processed missed event after restart");
  console.log("relayer-recovery.test.js passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
