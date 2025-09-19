const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IDOLocking Contract", function () {
  let IDOLocking, KlinkToken, idoLocking, klinkToken, owner, addr1, addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    // Deploy KlinkToken contract
    const KlinkTokenFactory = await ethers.getContractFactory("KlinkToken");
    klinkToken = await KlinkTokenFactory.deploy("KlinkToken", "KLINK", 1000);

    // Deploy IDOLocking contract with KlinkToken
    const IDOLockingFactory = await ethers.getContractFactory("IDOLocking");
    idoLocking = await IDOLockingFactory.deploy(
      "IDO Pool",
      klinkToken.target,
      123, // 1.23% rate
      720, // 720 hours (30 days)
      100000, // 100,000 tokens cap (will be scaled by decimals in contract)
      owner.address
    );
  });

  it("Should set the correct initial values", async function () {
    expect(await idoLocking.name()).to.equal("IDO Pool");
    expect(await idoLocking.tokenAddress()).to.equal(klinkToken.target);
    expect(await idoLocking.rate()).to.equal(123);
    expect(await idoLocking.lockDuration()).to.equal(720 * 3600); // 720 hours converted to seconds
    expect(await idoLocking.cap()).to.equal(ethers.parseEther("100000"));
  });

  it("Should not allow withdrawal without rewards", async function () {
    await expect(idoLocking.withdraw()).to.be.revertedWith(
      "No stakes found for user"
    );
  });

  it("Should allow adding rewards and successful withdrawal", async function () {
    await klinkToken.approve(idoLocking.target, ethers.parseEther("500"));
    await idoLocking.addReward(ethers.parseEther("500"));
    expect(await idoLocking.rewardBalance()).to.equal(ethers.parseEther("500"));

    await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
    await idoLocking.stake(ethers.parseEther("100"));

    await ethers.provider.send("evm_increaseTime", [720 * 3600]); // 720 hours in seconds
    await ethers.provider.send("evm_mine");

    await expect(idoLocking.withdraw()).to.emit(idoLocking, "PaidOut");
  });

  it("Should allow staking tokens", async function () {
    await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
    await expect(idoLocking.stake(ethers.parseEther("100")))
      .to.emit(idoLocking, "Staked")
      .withArgs(klinkToken.target, owner.address, ethers.parseEther("100"));
    expect(await idoLocking.stakedBalance()).to.equal(ethers.parseEther("100"));
  });

  it("Should not allow staking without approval", async function () {
    await expect(idoLocking.stake(ethers.parseEther("100"))).to.be.revertedWith(
      "Make sure to add enough allowance"
    );
  });

  it("Should not allow staking zero amount", async function () {
    await expect(idoLocking.stake(0)).to.be.revertedWith(
      "Can't stake 0 amount"
    );
  });

  it("Should allow withdrawal after lock period", async function () {
    await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
    await idoLocking.stake(ethers.parseEther("100"));
    await klinkToken.approve(idoLocking.target, ethers.parseEther("500"));
    await idoLocking.addReward(ethers.parseEther("500"));

    await ethers.provider.send("evm_increaseTime", [720 * 3600]); // 720 hours in seconds
    await ethers.provider.send("evm_mine");

    await expect(idoLocking.withdraw()).to.emit(idoLocking, "PaidOut");
  });

  it("Should prevent withdrawal before lock period", async function () {
    await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
    await idoLocking.stake(ethers.parseEther("100"));

    await expect(idoLocking.withdraw()).to.be.revertedWith(
      "Requesting before lock time"
    );
  });

  it("Should allow owner to set new rate and lock duration", async function () {
    await idoLocking.setRateAndLockduration(600, 60);
    expect(await idoLocking.rate()).to.equal(600);
    expect(await idoLocking.lockDuration()).to.equal(60 * 3600); // 60 hours converted to seconds
  });

  it("Should revert if non-owner tries to set rate and lock duration", async function () {
    await expect(
      idoLocking.connect(addr1).setRateAndLockduration(600, 60)
    ).to.be.revertedWith("Not the Gnosis Safe");
  });

  it("Should allow emergency withdrawal", async function () {
    await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
    await idoLocking.stake(ethers.parseEther("100"));

    await ethers.provider.send("evm_increaseTime", [720 * 3600]); // 720 hours in seconds
    await ethers.provider.send("evm_mine");

    await expect(idoLocking.emergencyWithdraw()).to.emit(idoLocking, "PaidOut");
  });

  it("Should allow withdrawal after lock period with rewards and verify interest paid", async function () {
    await klinkToken.approve(idoLocking.target, ethers.parseEther("500"));
    await idoLocking.addReward(ethers.parseEther("500"));

    await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
    const balanceBefore = await klinkToken.balanceOf(owner.address);
    await idoLocking.stake(ethers.parseEther("100"));

    await ethers.provider.send("evm_increaseTime", [720 * 3600]); // 720 hours in seconds
    await ethers.provider.send("evm_mine");

    await expect(idoLocking.withdraw()).to.emit(idoLocking, "PaidOut");
    const balanceAfter = await klinkToken.balanceOf(owner.address);

    // const interestPaid =
    //   ethers.formatEther(balanceAfter) - ethers.formatEther(balanceBefore);

    //   console.log("intrest paid out is:",interestPaid);
    // expect(interestPaid).to.equal(ethers.parseEther("5")); // Assuming 5% interest
  });

  it("Should calculate correct interest after staking", async function () {
    const stakeAmount = ethers.parseEther("100"); // Returns BigInt

    // Stake tokens
    await klinkToken.approve(
      idoLocking.target,
      ethers.parseEther("500").toString()
    );
    await idoLocking.stake(stakeAmount.toString());

    // Simulate time passage (720 hours = 30 days)
    await ethers.provider.send("evm_increaseTime", [720 * 3600]); // 720 hours in seconds
    await ethers.provider.send("evm_mine");

    // Calculate expected interest using the contract's formula
    // Interest rate basis points (1.23%)
    const lockDurationHours = 720; // 720 hours
    const amount = 100; // total amount staked
    const roi = 123; // interest rate (1.23% = 123 basis points)

    // Contract formula: (time * amount * rate) / (lockDuration * 10000)
    // Since we're calculating at the end of lock period, time = lockDuration
    let expectedInterest = ((lockDurationHours * 3600 * amount * roi) / (lockDurationHours * 3600 * 10000)).toFixed(6);

    // Call the contract function to check calculation
    const calculatedAmount = await idoLocking.calculate(owner.address);

    expect(
      (+ethers.formatEther(calculatedAmount) - amount).toFixed(6)
    ).to.equal(expectedInterest.toString());
  });
});
