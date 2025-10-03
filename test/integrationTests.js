const { expect } = require("chai");
const { ethers } = require("hardhat");

// Helper function to get current block timestamp
async function getCurrentBlockTimestamp() {
  const currentBlock = await ethers.provider.getBlock('latest');
  return currentBlock.timestamp;
}

describe("Integration Tests - Token and Staking Contracts", function () {
  let klinkToken, idoLocking;
  let owner, addr1, addr2, addr3;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3] = await ethers.getSigners();

    const currentBlock = await ethers.provider.getBlock('latest');
    const futureTimestamp = currentBlock.timestamp + 3600; // 1 hour from current block
    const initialSupply = 1000;
    const maxSupply = 10000;

    // Deploy KlinkTokenV2
    const KlinkTokenFactory = await ethers.getContractFactory("KlinkTokenV2");
    klinkToken = await KlinkTokenFactory.deploy(
      owner.address,
      "KlinkToken", 
      "KLINK", 
      initialSupply,
      maxSupply,
      futureTimestamp
    );

    // Deploy IDOLocking
    const IDOLockingFactory = await ethers.getContractFactory("IDOLocking");
    idoLocking = await IDOLockingFactory.deploy(
      "IDO Pool",
      klinkToken.target,
      123, // 1.23% rate
      720, // 720 hours (30 days)
      100000, // 100,000 tokens cap
      owner.address
    );
  });

  describe("Token Transfer Restrictions with Staking", function () {
    it("Should allow staking even when transfers are restricted", async function () {
      // Set future timestamp to restrict transfers
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 3600;
      await klinkToken.setTransferAllowedTimestamp(futureTimestamp);

      // Staking should still work (contract interaction)
      const stakeAmount = ethers.parseEther("100");
      await klinkToken.approve(idoLocking.target, stakeAmount);
      
      await expect(idoLocking.stake(stakeAmount))
        .to.not.be.reverted;

      expect(await idoLocking.balanceOf(owner.address)).to.equal(stakeAmount);
    });

    it("Should allow unstaking even when transfers are restricted", async function () {
      // First stake some tokens
      const stakeAmount = ethers.parseEther("100");
      await klinkToken.approve(idoLocking.target, stakeAmount);
      await idoLocking.stake(stakeAmount);

      // Set future timestamp to restrict transfers
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 3600;
      await klinkToken.setTransferAllowedTimestamp(futureTimestamp);

      // Fast forward time to allow unstaking
      await ethers.provider.send("evm_increaseTime", [720 * 3600]); // 720 hours
      await ethers.provider.send("evm_mine");

      // Unstaking should work even with transfer restrictions
      await expect(idoLocking.unstake(stakeAmount))
        .to.not.be.reverted;
    });

    it("Should handle whitelist interactions with staking", async function () {
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 3600;
      await klinkToken.setTransferAllowedTimestamp(futureTimestamp);

      // Add staking contract to whitelist
      await klinkToken.addToWhitelist(idoLocking.target);

      const stakeAmount = ethers.parseEther("100");
      await klinkToken.approve(idoLocking.target, stakeAmount);
      
      await expect(idoLocking.stake(stakeAmount))
        .to.not.be.reverted;
    });

    it("Should handle staking when token transfers are restricted", async function () {
      // Set future timestamp to restrict transfers
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 3600;
      await klinkToken.setTransferAllowedTimestamp(futureTimestamp);
      
      // Approve staking contract
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      
      // Staking should fail due to transfer restrictions
      await expect(idoLocking.stake(ethers.parseEther("100")))
        .to.be.revertedWith("not allowed");
      
      // Add staking contract to whitelist
      await klinkToken.addToWhitelist(idoLocking.target);
      
      // Staking should still fail because user is not whitelisted
      await expect(idoLocking.stake(ethers.parseEther("100")))
        .to.be.revertedWith("Transfers not allowed yet");
      
      // Add user to whitelist
      await klinkToken.addToWhitelist(owner.address);
      
      // Now staking should work
      await expect(idoLocking.stake(ethers.parseEther("100")))
        .to.emit(idoLocking, "Staked");
    });

    it("Should handle withdrawal when token transfers are restricted", async function () {
      // First stake when transfers are allowed
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await idoLocking.stake(ethers.parseEther("100"));
      
      // Fast forward past lock time
      await ethers.provider.send("evm_increaseTime", [720 * 3600]);
      await ethers.provider.send("evm_mine");
      
      // Add rewards
      await klinkToken.approve(idoLocking.target, ethers.parseEther("500"));
      await idoLocking.addReward(ethers.parseEther("500"));
      
      // Now restrict transfers
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 3600;
      await klinkToken.setTransferAllowedTimestamp(futureTimestamp);
      
      // Withdrawal should fail due to transfer restrictions
      await expect(idoLocking.withdraw())
        .to.be.revertedWith("Transfers not allowed yet");
      
      // Add staking contract to whitelist (for sending tokens back)
      await klinkToken.addToWhitelist(idoLocking.target);
      
      // Withdrawal should now work
      await expect(idoLocking.withdraw())
        .to.emit(idoLocking, "PaidOut");
    });

    it("Should handle emergency withdrawal with transfer restrictions", async function () {
      // Stake tokens
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await idoLocking.stake(ethers.parseEther("100"));
      
      // Restrict transfers
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 3600;
      await klinkToken.setTransferAllowedTimestamp(futureTimestamp);
      
      // Emergency withdrawal should fail
      await expect(idoLocking.emergencyWithdraw())
        .to.be.revertedWith("Transfers not allowed yet");
      
      // Add staking contract to whitelist
      await klinkToken.addToWhitelist(idoLocking.target);
      
      // Emergency withdrawal should now work
      await expect(idoLocking.emergencyWithdraw())
        .to.emit(idoLocking, "EmergencyWithdraw");
    });
  });

  describe("Token Cap and Staking Interactions", function () {
    it("Should handle staking when approaching token cap", async function () {
      const cap = await klinkToken.MAX_SUPPLY();
      const currentSupply = await klinkToken.totalSupply();
      const remainingMintable = cap - currentSupply;
      
      // Mint tokens close to cap
      if (remainingMintable > ethers.parseEther("100")) {
        await klinkToken.mint(owner.address, remainingMintable - ethers.parseEther("50"));
      }
      
      // Should be able to stake existing tokens
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await expect(idoLocking.stake(ethers.parseEther("100")))
        .to.emit(idoLocking, "Staked");
      
      // Try to mint more tokens for rewards (should fail if at cap)
      const newSupply = await klinkToken.totalSupply();
      if (newSupply >= cap) {
        await expect(klinkToken.mint(owner.address, ethers.parseEther("1")))
          .to.be.revertedWith("ERC20Capped: cap exceeded");
      }
    });

    it("Should handle reward distribution when token supply is at cap", async function () {
      // Stake some tokens
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await idoLocking.stake(ethers.parseEther("100"));
      
      // Add existing tokens as rewards (not minting new ones)
      await klinkToken.approve(idoLocking.target, ethers.parseEther("200"));
      await idoLocking.addReward(ethers.parseEther("200"));
      
      // Fast forward past lock time
      await ethers.provider.send("evm_increaseTime", [720 * 3600]);
      await ethers.provider.send("evm_mine");
      
      // Should be able to withdraw with rewards
      await expect(idoLocking.withdraw())
        .to.emit(idoLocking, "PaidOut");
    });
  });

  describe("Multi-User Staking with Token Restrictions", function () {
    it("Should handle multiple users staking with different whitelist statuses", async function () {
      // Set transfer restrictions
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 3600;
      await klinkToken.setTransferAllowedTimestamp(futureTimestamp);
      
      // Transfer tokens to users
      await klinkToken.transfer(addr1.address, ethers.parseEther("200"));
      await klinkToken.transfer(addr2.address, ethers.parseEther("200"));
      
      // Add staking contract to whitelist
      await klinkToken.addToWhitelist(idoLocking.target);
      
      // User 1 not whitelisted - should fail
      await klinkToken.connect(addr1).approve(idoLocking.target, ethers.parseEther("100"));
      await expect(idoLocking.connect(addr1).stake(ethers.parseEther("100")))
        .to.be.revertedWith("Transfers not allowed yet");
      
      // Add user 1 to whitelist
      await klinkToken.addToWhitelist(addr1.address);
      
      // User 1 should now be able to stake
      await expect(idoLocking.connect(addr1).stake(ethers.parseEther("100")))
        .to.emit(idoLocking, "Staked");
      
      // User 2 still not whitelisted - should fail
      await klinkToken.connect(addr2).approve(idoLocking.target, ethers.parseEther("100"));
      await expect(idoLocking.connect(addr2).stake(ethers.parseEther("100")))
        .to.be.revertedWith("Transfers not allowed yet");
      
      // Remove transfer restrictions
      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600;
      await klinkToken.setTransferAllowedTimestamp(pastTimestamp);
      
      // User 2 should now be able to stake
      await expect(idoLocking.connect(addr2).stake(ethers.parseEther("100")))
        .to.emit(idoLocking, "Staked");
    });

    it("Should handle staking cap with multiple users and timelock scenarios", async function () {
      const stakingCap = await idoLocking.cap();
      
      // Transfer tokens to users
      await klinkToken.transfer(addr1.address, stakingCap / BigInt(2));
      await klinkToken.transfer(addr2.address, stakingCap / BigInt(2));
      
      // User 1 stakes half the cap
      await klinkToken.connect(addr1).approve(idoLocking.target, stakingCap / BigInt(2));
      await idoLocking.connect(addr1).stake(stakingCap / BigInt(2));
      
      // Set different lock duration
      await idoLocking.setRateAndLockduration(123, 1440); // 60 days
      
      // User 2 stakes the remaining half
      await klinkToken.connect(addr2).approve(idoLocking.target, stakingCap / BigInt(2));
      await idoLocking.connect(addr2).stake(stakingCap / BigInt(2));
      
      // Cap should be reached
      expect(await idoLocking.stakedBalance()).to.equal(stakingCap);
      
      // Additional staking should fail
      await klinkToken.approve(idoLocking.target, ethers.parseEther("1"));
      await expect(idoLocking.stake(ethers.parseEther("1")))
        .to.be.revertedWith("Cap exceeded");
      
      // Fast forward to unlock user 1 (720 hours)
      await ethers.provider.send("evm_increaseTime", [720 * 3600]);
      await ethers.provider.send("evm_mine");
      
      // Add rewards
      await klinkToken.approve(idoLocking.target, ethers.parseEther("1000"));
      await idoLocking.addReward(ethers.parseEther("1000"));
      
      // User 1 can withdraw (unlocked)
      await expect(idoLocking.connect(addr1).withdraw())
        .to.emit(idoLocking, "PaidOut");
      
      // User 2 cannot withdraw yet (still locked for 720 more hours)
      await expect(idoLocking.connect(addr2).withdraw())
        .to.be.revertedWith("Requesting before lock time");
      
      // Now owner can stake again (cap freed up)
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await expect(idoLocking.stake(ethers.parseEther("100")))
        .to.emit(idoLocking, "Staked");
    });
  });

  describe("Token Burning and Staking Interactions", function () {
    it("Should handle token burning while tokens are staked", async function () {
      const initialSupply = await klinkToken.totalSupply();
      
      // Stake some tokens
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await idoLocking.stake(ethers.parseEther("100"));
      
      // Burn some tokens from owner's balance
      await klinkToken.burn(ethers.parseEther("50"));
      
      const newSupply = await klinkToken.totalSupply();
      expect(newSupply).to.equal(initialSupply - ethers.parseEther("50"));
      
      // Staked tokens should still be intact
      expect(await idoLocking.stakedBalance()).to.equal(ethers.parseEther("100"));
      
      // Should be able to withdraw staked tokens after lock period
      await ethers.provider.send("evm_increaseTime", [720 * 3600]);
      await ethers.provider.send("evm_mine");
      
      await klinkToken.approve(idoLocking.target, ethers.parseEther("500"));
      await idoLocking.addReward(ethers.parseEther("500"));
      
      await expect(idoLocking.withdraw())
        .to.emit(idoLocking, "PaidOut");
    });

    it("Should handle burning tokens that were used as rewards", async function () {
      // Add rewards
      await klinkToken.approve(idoLocking.target, ethers.parseEther("500"));
      await idoLocking.addReward(ethers.parseEther("500"));
      
      // Stake tokens
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await idoLocking.stake(ethers.parseEther("100"));
      
      // Try to burn tokens from owner (should work as rewards are transferred to contract)
      const ownerBalance = await klinkToken.balanceOf(owner.address);
      if (ownerBalance > 0) {
        await klinkToken.burn(ownerBalance);
      }
      
      // Fast forward past lock time
      await ethers.provider.send("evm_increaseTime", [720 * 3600]);
      await ethers.provider.send("evm_mine");
      
      // Should still be able to withdraw with rewards
      await expect(idoLocking.withdraw())
        .to.emit(idoLocking, "PaidOut");
    });
  });

  describe("Complex Timelock Scenarios", function () {
    it("Should handle overlapping timelock and staking periods", async function () {
      // Set token unlock time to 2 hours from now
      const tokenUnlockTime = (await getCurrentBlockTimestamp()) + 7200;
      await klinkToken.setTransferAllowedTimestamp(tokenUnlockTime);

      // Stake tokens (should work even with timelock)
      const stakeAmount = ethers.parseEther("100");
      await klinkToken.approve(idoLocking.target, stakeAmount);
      await idoLocking.stake(stakeAmount);

      // Fast forward 1 hour (tokens still locked, staking period not complete)
      await ethers.provider.send("evm_increaseTime", [3600]);
      await ethers.provider.send("evm_mine");

      // Should not be able to transfer tokens yet
      await expect(
        klinkToken.transfer(addr1.address, ethers.parseEther("10"))
      ).to.be.revertedWith("not allowed");

      // Fast forward another 2 hours (tokens unlocked, staking period complete)
      await ethers.provider.send("evm_increaseTime", [7200]);
      await ethers.provider.send("evm_mine");

      // Should be able to unstake and transfer
      await idoLocking.unstake(stakeAmount);
      await expect(
        klinkToken.transfer(addr1.address, ethers.parseEther("10"))
      ).to.not.be.reverted;
    });

    it("Should handle dynamic timelock changes during staking", async function () {
      // Initial timelock
      const pastTimestamp = (await getCurrentBlockTimestamp()) - 3600;
      await klinkToken.setTransferAllowedTimestamp(pastTimestamp);

      // Stake tokens
      const stakeAmount = ethers.parseEther("100");
      await klinkToken.approve(idoLocking.target, stakeAmount);
      await idoLocking.stake(stakeAmount);

      // Change timelock to future
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 3600;
      await klinkToken.setTransferAllowedTimestamp(futureTimestamp);

      // Should not be able to transfer
      await expect(
        klinkToken.transfer(addr1.address, ethers.parseEther("10"))
      ).to.be.revertedWith("not allowed");

      // But staking operations should still work
      await klinkToken.approve(idoLocking.target, stakeAmount);
      await expect(idoLocking.stake(stakeAmount))
        .to.not.be.reverted;
    });

    it("Should handle rate changes affecting interest calculations", async function () {
      // Add rewards
      await klinkToken.approve(idoLocking.target, ethers.parseEther("1000"));
      await idoLocking.addReward(ethers.parseEther("1000"));
      
      // Stake with initial rate (1.23%)
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await idoLocking.stake(ethers.parseEther("100"));
      
      const initialCalculation = await idoLocking.calculate(owner.address);
      
      // Change rate to higher value (2.46%)
      await idoLocking.setRateAndLockduration(246, 720);
      
      // Calculation should remain the same for existing stakes
      const calculationAfterRateChange = await idoLocking.calculate(owner.address);
      expect(calculationAfterRateChange).to.equal(initialCalculation);
      
      // New stake should use new rate
      await klinkToken.approve(idoLocking.target, ethers.parseEther("100"));
      await idoLocking.stake(ethers.parseEther("100"));
      
      // Fast forward to unlock time
      await ethers.provider.send("evm_increaseTime", [720 * 3600]);
      await ethers.provider.send("evm_mine");
      
      const finalCalculation = await idoLocking.calculate(owner.address);
      
      // Should be more than double the initial calculation due to higher rate on second stake
      expect(finalCalculation).to.be.gt(initialCalculation * BigInt(2));
    });
  });

  describe("Security and Access Control Integration", function () {
    it("Should prevent unauthorized timelock changes", async function () {
      await expect(
        klinkToken.connect(addr1).setTransferAllowedTimestamp((await getCurrentBlockTimestamp()) + 3600)
      ).to.be.revertedWithCustomError(klinkToken, "OwnableUnauthorizedAccount");
    });

    it("Should handle ownership transfer with timelock", async function () {
      // Set timelock
      await klinkToken.setTransferAllowedTimestamp((await getCurrentBlockTimestamp()) + 3600);

      // Transfer ownership
      await klinkToken.transferOwnership(addr1.address);

      // New owner should be able to change timelock
      await expect(
        klinkToken.connect(addr1).setTransferAllowedTimestamp((await getCurrentBlockTimestamp()) + 3600)
      ).to.not.be.reverted;

      // Old owner should not
      await expect(
        klinkToken.setTransferAllowedTimestamp((await getCurrentBlockTimestamp()) + 3600)
      ).to.be.revertedWithCustomError(klinkToken, "OwnableUnauthorizedAccount");
    });
  });
});