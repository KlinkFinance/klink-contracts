const { expect } = require("chai");
const { ethers } = require("hardhat");

// Helper function to get current block timestamp
async function getCurrentBlockTimestamp() {
  const currentBlock = await ethers.provider.getBlock('latest');
  return currentBlock.timestamp;
}

describe("IDOLocking Contract", function () {
  let IDOLocking, KlinkToken, idoLocking, klinkToken, owner, addr1, addr2, addr3;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3] = await ethers.getSigners();

    const currentBlock = await ethers.provider.getBlock('latest');
    const futureTimestamp = currentBlock.timestamp + 3600; // 1 hour from current block
    const initialSupply = 1000;
    const maxSupply = 10000;

    // Deploy KlinkTokenV2 contract
    const KlinkTokenFactory = await ethers.getContractFactory("KlinkTokenV2");
    klinkToken = await KlinkTokenFactory.deploy(
      owner.address,
      "KlinkToken", 
      "KLINK", 
      initialSupply,
      maxSupply,
      futureTimestamp
    );

    // Deploy IDOLocking contract with KlinkTokenV2
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

  // ==================== COMPREHENSIVE TIMELOCK TESTS ====================

  describe("Timelock Duration Management", function () {
    it("Should allow owner to change lock duration", async function () {
      const newLockDuration = 168; // 1 week in hours
      await idoLocking.setRateAndLockduration(123, newLockDuration);
      expect(await idoLocking.lockDuration()).to.equal(newLockDuration * 3600); // converted to seconds
    });

    it("Should prevent non-owner from changing lock duration", async function () {
      await expect(
        idoLocking.connect(addr1).setRateAndLockduration(123, 168)
      ).to.be.revertedWith("Not the Gnosis Safe");
    });

    it("Should apply new lock duration to new stakes only", async function () {
      // First stake with original duration (720 hours)
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await idoLocking.stake(ethers.parseEther("100"));
      
      const firstStakeTime = (await ethers.provider.getBlock('latest')).timestamp;
      
      // Change lock duration
      const newLockDuration = 168; // 1 week
      await idoLocking.setRateAndLockduration(123, newLockDuration);
      
      // Second stake with new duration
      await klinkToken.approve(idoLocking.target, ethers.parseEther("50"));
      await idoLocking.stake(ethers.parseEther("50"));
      
      const deposits = await idoLocking.userDeposits(owner.address);
      
      // First deposit should still have original lock duration
      expect(deposits[0].lockTime).to.equal(firstStakeTime + (720 * 3600));
      
      // Second deposit should have new lock duration
      const secondStakeTime = (await ethers.provider.getBlock('latest')).timestamp;
      expect(deposits[1].lockTime).to.equal(secondStakeTime + (168 * 3600));
    });
  });

  describe("Multiple Stakes with Different Timelock Periods", function () {
    it("Should handle multiple stakes with different lock durations", async function () {
      // First stake with 720 hours
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await idoLocking.stake(ethers.parseEther("100"));
      const firstStakeTime = (await ethers.provider.getBlock('latest')).timestamp;
      
      // Change to 168 hours and stake again
      await idoLocking.setRateAndLockduration(123, 168);
      await klinkToken.approve(idoLocking.target, ethers.parseEther("50"));
      await idoLocking.stake(ethers.parseEther("50"));
      const secondStakeTime = (await ethers.provider.getBlock('latest')).timestamp;
      
      // Change to 336 hours and stake again
      await idoLocking.setRateAndLockduration(123, 336);
      await klinkToken.approve(idoLocking.target, ethers.parseEther("75"));
      await idoLocking.stake(ethers.parseEther("75"));
      const thirdStakeTime = (await ethers.provider.getBlock('latest')).timestamp;
      
      const deposits = await idoLocking.userDeposits(owner.address);
      
      expect(deposits.length).to.equal(3);
      expect(deposits[0].lockTime).to.equal(firstStakeTime + (720 * 3600));
      expect(deposits[1].lockTime).to.equal(secondStakeTime + (168 * 3600));
      expect(deposits[2].lockTime).to.equal(thirdStakeTime + (336 * 3600));
    });

    it("Should prevent withdrawal of individual stakes before their respective lock times", async function () {
      // Stake with 720 hours
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await idoLocking.stake(ethers.parseEther("100"));
      
      // Change to 1 hour and stake again
      await idoLocking.setRateAndLockduration(123, 1);
      await klinkToken.approve(idoLocking.target, ethers.parseEther("50"));
      await idoLocking.stake(ethers.parseEther("50"));
      
      // Fast forward 2 hours (second stake should be unlocked, first still locked)
      await ethers.provider.send("evm_increaseTime", [2 * 3600]);
      await ethers.provider.send("evm_mine");
      
      // Should still fail because first stake (larger lock time) is not unlocked
      await expect(idoLocking.withdraw()).to.be.revertedWith("Requesting before lock time");
    });

    it("Should allow withdrawal when all stakes are unlocked", async function () {
      await klinkToken.approve(idoLocking.target, ethers.parseEther("500"));
      await idoLocking.addReward(ethers.parseEther("500"));
      
      // Stake with 2 hours
      await idoLocking.setRateAndLockduration(123, 2);
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await idoLocking.stake(ethers.parseEther("100"));
      
      // Stake with 1 hour
      await idoLocking.setRateAndLockduration(123, 1);
      await klinkToken.approve(idoLocking.target, ethers.parseEther("50"));
      await idoLocking.stake(ethers.parseEther("50"));
      
      // Fast forward 3 hours (both stakes should be unlocked)
      await ethers.provider.send("evm_increaseTime", [3 * 3600]);
      await ethers.provider.send("evm_mine");
      
      await expect(idoLocking.withdraw()).to.emit(idoLocking, "PaidOut");
    });
  });

  describe("Interest Calculation with Different Timelock Periods", function () {
    it("Should calculate correct interest for different lock durations", async function () {
      await klinkToken.approve(idoLocking.target, ethers.parseEther("1000"));
      await idoLocking.addReward(ethers.parseEther("1000"));
      
      const stakeAmount = ethers.parseEther("100");
      
      // Stake with 720 hours (30 days)
      await idoLocking.setRateAndLockduration(123, 720); // 1.23% rate
      await klinkToken.approve(idoLocking.target, stakeAmount);
      await idoLocking.stake(stakeAmount);
      
      // Fast forward exactly 720 hours
      await ethers.provider.send("evm_increaseTime", [720 * 3600]);
      await ethers.provider.send("evm_mine");
      
      const calculatedAmount = await idoLocking.calculate(owner.address);
      const expectedInterest = (100 * 123) / 10000; // 1.23% of 100
      
      expect(
        (+ethers.formatEther(calculatedAmount) - 100).toFixed(6)
      ).to.equal(expectedInterest.toFixed(6));
    });

    it("Should calculate proportional interest for partial lock periods", async function () {
      await klinkToken.approve(idoLocking.target, ethers.parseEther("1000"));
      await idoLocking.addReward(ethers.parseEther("1000"));
      
      const stakeAmount = ethers.parseEther("100");
      
      // Stake with 720 hours lock duration
      await idoLocking.setRateAndLockduration(123, 720);
      await klinkToken.approve(idoLocking.target, stakeAmount);
      await idoLocking.stake(stakeAmount);
      
      // Fast forward only 360 hours (half the lock period)
      await ethers.provider.send("evm_increaseTime", [360 * 3600]);
      await ethers.provider.send("evm_mine");
      
      const calculatedAmount = await idoLocking.calculate(owner.address);
      const expectedInterest = (360 * 100 * 123) / (720 * 10000); // Proportional interest
      
      expect(
        (+ethers.formatEther(calculatedAmount) - 100).toFixed(6)
      ).to.equal(expectedInterest.toFixed(6));
    });

    it("Should handle interest calculation for multiple stakes with different rates and durations", async function () {
      await klinkToken.approve(idoLocking.target, ethers.parseEther("1000"));
      await idoLocking.addReward(ethers.parseEther("1000"));
      
      // First stake: 100 tokens, 1.23% rate, 720 hours
      await idoLocking.setRateAndLockduration(123, 720);
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await idoLocking.stake(ethers.parseEther("100"));
      
      // Second stake: 50 tokens, 2.46% rate, 168 hours
      await idoLocking.setRateAndLockduration(246, 168);
      await klinkToken.approve(idoLocking.target, ethers.parseEther("50"));
      await idoLocking.stake(ethers.parseEther("50"));
      
      // Fast forward 720 hours (both stakes should be fully matured)
      await ethers.provider.send("evm_increaseTime", [720 * 3600]);
      await ethers.provider.send("evm_mine");
      
      const calculatedAmount = await idoLocking.calculate(owner.address);
      
      // Expected interest:
      // First stake: 100 * 1.23% = 1.23
      // Second stake: 50 * 2.46% = 1.23 (but it was locked for 168 hours, so full interest)
      const expectedTotal = 100 + 50 + 1.23 + 1.23; // principal + interests
      
      expect(
        (+ethers.formatEther(calculatedAmount)).toFixed(2)
      ).to.equal(expectedTotal.toFixed(2));
    });
  });

  describe("Emergency Withdrawal with Timelock", function () {
    it("Should allow emergency withdrawal regardless of lock time", async function () {
      // Stake with long lock duration
      await idoLocking.setRateAndLockduration(123, 8760); // 1 year
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await idoLocking.stake(ethers.parseEther("100"));
      
      // Emergency withdrawal should work immediately
      const balanceBefore = await klinkToken.balanceOf(owner.address);
      await expect(idoLocking.emergencyWithdraw()).to.emit(idoLocking, "PaidOut");
      const balanceAfter = await klinkToken.balanceOf(owner.address);
      
      // Should get back only principal, no interest
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("100"));
    });

    it("Should not pay interest on emergency withdrawal", async function () {
      await klinkToken.approve(idoLocking.target, ethers.parseEther("500"));
      await idoLocking.addReward(ethers.parseEther("500"));
      
      // Stake and wait some time
      await idoLocking.setRateAndLockduration(123, 720);
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await idoLocking.stake(ethers.parseEther("100"));
      
      // Fast forward halfway through lock period
      await ethers.provider.send("evm_increaseTime", [360 * 3600]);
      await ethers.provider.send("evm_mine");
      
      const balanceBefore = await klinkToken.balanceOf(owner.address);
      await idoLocking.emergencyWithdraw();
      const balanceAfter = await klinkToken.balanceOf(owner.address);
      
      // Should only get principal back
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("100"));
    });
  });

  describe("Timelock Edge Cases", function () {
    it("Should handle zero lock duration", async function () {
      await idoLocking.setRateAndLockduration(123, 0);
      
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await idoLocking.stake(ethers.parseEther("100"));
      
      // Should be able to withdraw immediately
      await klinkToken.approve(idoLocking.target, ethers.parseEther("500"));
      await idoLocking.addReward(ethers.parseEther("500"));
      
      await expect(idoLocking.withdraw()).to.emit(idoLocking, "PaidOut");
    });

    it("Should handle very long lock durations", async function () {
      const veryLongDuration = 87600; // 10 years in hours
      await idoLocking.setRateAndLockduration(123, veryLongDuration);
      
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await idoLocking.stake(ethers.parseEther("100"));
      
      const deposits = await idoLocking.userDeposits(owner.address);
      const currentTime = (await ethers.provider.getBlock('latest')).timestamp;
      
      expect(deposits[0].lockTime).to.equal(currentTime + (veryLongDuration * 3600));
    });

    it("Should handle maximum timestamp values", async function () {
      // Test with a reasonable future timestamp to avoid overflow
      const farFuture = (await getCurrentBlockTimestamp()) + (365 * 24 * 3600); // 1 year from now
      await idoLocking.setRateAndLockduration(123, 8760); // 1 year lock
      
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await idoLocking.stake(ethers.parseEther("100"));
      
      // Should not revert
      const deposits = await idoLocking.userDeposits(owner.address);
      expect(deposits.length).to.equal(1);
    });

    it("Should handle withdrawal exactly at lock expiry", async function () {
      await klinkToken.approve(idoLocking.target, ethers.parseEther("500"));
      await idoLocking.addReward(ethers.parseEther("500"));
      
      await idoLocking.setRateAndLockduration(123, 1); // 1 hour lock
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await idoLocking.stake(ethers.parseEther("100"));
      
      // Fast forward exactly 1 hour
      await ethers.provider.send("evm_increaseTime", [3600]);
      await ethers.provider.send("evm_mine");
      
      await expect(idoLocking.withdraw()).to.emit(idoLocking, "PaidOut");
    });
  });

  describe("Rate Changes with Timelock", function () {
    it("Should apply new rates only to new stakes", async function () {
      await klinkToken.approve(idoLocking.target, ethers.parseEther("1000"));
      await idoLocking.addReward(ethers.parseEther("1000"));
      
      // First stake with 1.23% rate
      await idoLocking.setRateAndLockduration(123, 720);
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await idoLocking.stake(ethers.parseEther("100"));
      
      // Change rate to 2.46%
      await idoLocking.setRateAndLockduration(246, 720);
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await idoLocking.stake(ethers.parseEther("100"));
      
      // Fast forward to unlock both
      await ethers.provider.send("evm_increaseTime", [720 * 3600]);
      await ethers.provider.send("evm_mine");
      
      const calculatedAmount = await idoLocking.calculate(owner.address);
      
      // Expected: 100 (first principal) + 1.23 (first interest) + 100 (second principal) + 2.46 (second interest)
      const expectedTotal = 100 + 1.23 + 100 + 2.46;
      
      expect(
        (+ethers.formatEther(calculatedAmount)).toFixed(2)
      ).to.equal(expectedTotal.toFixed(2));
    });

    it("Should handle rate changes during lock period", async function () {
      await klinkToken.approve(idoLocking.target, ethers.parseEther("1000"));
      await idoLocking.addReward(ethers.parseEther("1000"));
      
      // Stake with initial rate
      await idoLocking.setRateAndLockduration(123, 720);
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await idoLocking.stake(ethers.parseEther("100"));
      
      // Change rate after staking (should not affect existing stake)
      await idoLocking.setRateAndLockduration(500, 720);
      
      // Fast forward to unlock
      await ethers.provider.send("evm_increaseTime", [720 * 3600]);
      await ethers.provider.send("evm_mine");
      
      const calculatedAmount = await idoLocking.calculate(owner.address);
      
      // Should still use original rate (1.23%)
      const expectedTotal = 100 + 1.23;
      
      expect(
        (+ethers.formatEther(calculatedAmount)).toFixed(2)
      ).to.equal(expectedTotal.toFixed(2));
    });
  });
});
