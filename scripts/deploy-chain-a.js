const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  const VaultToken = await hre.ethers.getContractFactory("VaultToken");
  const vaultToken = await VaultToken.deploy(hre.ethers.parseEther("1000000"));
  await vaultToken.waitForDeployment();

  const BridgeLock = await hre.ethers.getContractFactory("BridgeLock");
  const bridgeLock = await BridgeLock.deploy(
    await vaultToken.getAddress(),
    deployer.address,
  );
  await bridgeLock.waitForDeployment();

  const GovernanceEmergency = await hre.ethers.getContractFactory(
    "GovernanceEmergency",
  );
  const governanceEmergency = await GovernanceEmergency.deploy(
    await bridgeLock.getAddress(),
    deployer.address,
  );
  await governanceEmergency.waitForDeployment();

  const governanceRole = await bridgeLock.GOVERNANCE_ROLE();
  await (
    await bridgeLock.grantRole(
      governanceRole,
      await governanceEmergency.getAddress(),
    )
  ).wait();

  const output = {
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    vaultToken: await vaultToken.getAddress(),
    bridgeLock: await bridgeLock.getAddress(),
    governanceEmergency: await governanceEmergency.getAddress(),
  };

  const outPath = path.join(__dirname, "..", "deployments", "chain-a.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log("Chain A deployed:", output);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
