const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  const WrappedVaultToken =
    await hre.ethers.getContractFactory("WrappedVaultToken");
  const wrappedVaultToken = await WrappedVaultToken.deploy(deployer.address);
  await wrappedVaultToken.waitForDeployment();

  const BridgeMint = await hre.ethers.getContractFactory("BridgeMint");
  const bridgeMint = await BridgeMint.deploy(
    await wrappedVaultToken.getAddress(),
    deployer.address,
  );
  await bridgeMint.waitForDeployment();

  const GovernanceVoting =
    await hre.ethers.getContractFactory("GovernanceVoting");
  const governanceVoting = await GovernanceVoting.deploy(
    await wrappedVaultToken.getAddress(),
    hre.ethers.parseEther("1"),
  );
  await governanceVoting.waitForDeployment();

  const bridgeMintRole = await wrappedVaultToken.BRIDGE_MINT_ROLE();
  await (
    await wrappedVaultToken.grantRole(
      bridgeMintRole,
      await bridgeMint.getAddress(),
    )
  ).wait();

  const output = {
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    wrappedVaultToken: await wrappedVaultToken.getAddress(),
    bridgeMint: await bridgeMint.getAddress(),
    governanceVoting: await governanceVoting.getAddress(),
  };

  const outPath = path.join(__dirname, "..", "deployments", "chain-b.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log("Chain B deployed:", output);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
