const assert = require("assert");
const { ethers } = require("hardhat");

async function expectRevert(promise, contains) {
  let reverted = false;
  try {
    await promise;
  } catch (error) {
    reverted = true;
    if (contains) {
      assert(
        error.message.includes(contains),
        `Expected revert including '${contains}', got: ${error.message}`,
      );
    }
  }
  assert(reverted, "Expected transaction to revert");
}

describe("Omnichain bridge contracts", function () {
  let deployer;
  let relayer;
  let user;

  beforeEach(async function () {
    [deployer, relayer, user] = await ethers.getSigners();
  });

  it("Chain A lock/unlock + replay guard + governance pause", async function () {
    const VaultToken = await ethers.getContractFactory("VaultToken");
    const vault = await VaultToken.deploy(ethers.parseEther("1000"));
    await vault.waitForDeployment();

    const BridgeLock = await ethers.getContractFactory("BridgeLock");
    const bridgeLock = await BridgeLock.deploy(
      await vault.getAddress(),
      deployer.address,
    );
    await bridgeLock.waitForDeployment();

    const GovernanceEmergency = await ethers.getContractFactory(
      "GovernanceEmergency",
    );
    const governanceEmergency = await GovernanceEmergency.deploy(
      await bridgeLock.getAddress(),
      deployer.address,
    );
    await governanceEmergency.waitForDeployment();

    const relayerRole = await bridgeLock.RELAYER_ROLE();
    const governanceRole = await bridgeLock.GOVERNANCE_ROLE();

    await (await bridgeLock.grantRole(relayerRole, relayer.address)).wait();
    await (
      await bridgeLock.grantRole(
        governanceRole,
        await governanceEmergency.getAddress(),
      )
    ).wait();

    await (await vault.transfer(user.address, ethers.parseEther("200"))).wait();
    await (
      await vault
        .connect(user)
        .approve(await bridgeLock.getAddress(), ethers.parseEther("200"))
    ).wait();

    await (
      await bridgeLock.connect(user).lock(ethers.parseEther("100"))
    ).wait();

    const bridgeBal = await vault.balanceOf(await bridgeLock.getAddress());
    assert.equal(bridgeBal.toString(), ethers.parseEther("100").toString());

    await (
      await bridgeLock
        .connect(relayer)
        .unlock(user.address, ethers.parseEther("50"), 7)
    ).wait();

    await expectRevert(
      bridgeLock
        .connect(relayer)
        .unlock(user.address, ethers.parseEther("50"), 7),
      "unlock nonce used",
    );

    await (await governanceEmergency.connect(deployer).pauseBridge()).wait();

    await expectRevert(
      bridgeLock.connect(user).lock(ethers.parseEther("1")),
      "EnforcedPause",
    );
  });

  it("Chain B mint/burn + replay guard + governance vote emits ProposalPassed", async function () {
    const WrappedVaultToken =
      await ethers.getContractFactory("WrappedVaultToken");
    const wrapped = await WrappedVaultToken.deploy(deployer.address);
    await wrapped.waitForDeployment();

    const BridgeMint = await ethers.getContractFactory("BridgeMint");
    const bridgeMint = await BridgeMint.deploy(
      await wrapped.getAddress(),
      deployer.address,
    );
    await bridgeMint.waitForDeployment();

    const GovernanceVoting =
      await ethers.getContractFactory("GovernanceVoting");
    const governanceVoting = await GovernanceVoting.deploy(
      await wrapped.getAddress(),
      ethers.parseEther("1"),
    );
    await governanceVoting.waitForDeployment();

    const relayerRole = await bridgeMint.RELAYER_ROLE();
    await (await bridgeMint.grantRole(relayerRole, relayer.address)).wait();

    const mintRole = await wrapped.BRIDGE_MINT_ROLE();
    await (
      await wrapped.grantRole(mintRole, await bridgeMint.getAddress())
    ).wait();

    await (
      await bridgeMint
        .connect(relayer)
        .mintWrapped(user.address, ethers.parseEther("10"), 22)
    ).wait();

    await expectRevert(
      bridgeMint
        .connect(relayer)
        .mintWrapped(user.address, ethers.parseEther("10"), 22),
      "mint nonce used",
    );

    const userBalBeforeBurn = await wrapped.balanceOf(user.address);
    assert.equal(
      userBalBeforeBurn.toString(),
      ethers.parseEther("10").toString(),
    );

    await (await bridgeMint.connect(user).burn(ethers.parseEther("3"))).wait();
    const userBalAfterBurn = await wrapped.balanceOf(user.address);
    assert.equal(
      userBalAfterBurn.toString(),
      ethers.parseEther("7").toString(),
    );

    const callData = wrapped.interface.encodeFunctionData("mint", [
      user.address,
      1n,
    ]);
    await (
      await governanceVoting.connect(user).createProposal(callData, 2)
    ).wait();
    await (await governanceVoting.connect(user).vote(0, true)).wait();

    await ethers.provider.send("evm_mine", []);
    await ethers.provider.send("evm_mine", []);
    await ethers.provider.send("evm_mine", []);

    const tx = await governanceVoting.finalize(0);
    const receipt = await tx.wait();

    const found = receipt.logs.some((log) => {
      try {
        const parsed = governanceVoting.interface.parseLog(log);
        return parsed && parsed.name === "ProposalPassed";
      } catch {
        return false;
      }
    });

    assert(found, "Expected ProposalPassed event");
  });
});
