const { expect } = require("chai");
const { ethers } = require("hardhat");

// Helper function to get current block timestamp
async function getCurrentBlockTimestamp() {
  const currentBlock = await ethers.provider.getBlock('latest');
  return currentBlock.timestamp;
}

describe("KlinkToken Timelock and Supply Tests", function () {
  let klinkToken;
  let owner, addr1, addr2, addr3;
  const INITIAL_SUPPLY = 1000; // 1000 tokens
  const MAX_SUPPLY = 10000; // 10000 tokens

  beforeEach(async function () {
    [owner, addr1, addr2, addr3] = await ethers.getSigners();

    const currentBlock = await ethers.provider.getBlock('latest');
    const futureTimestamp = currentBlock.timestamp + 86400; // 24 hours from current block

    // Deploy KlinkTokenV2
    const KlinkTokenFactory = await ethers.getContractFactory("KlinkTokenV2");
    klinkToken = await KlinkTokenFactory.deploy(
      owner.address,
      "KlinkToken",
      "KLINK",
      INITIAL_SUPPLY,
      MAX_SUPPLY,
      futureTimestamp
    );
  });

  describe("Constructor and Initial Supply Validation", function () {
    it("Should validate initial supply is not greater than max supply", async function () {
      const KlinkTokenFactory = await ethers.getContractFactory("KlinkTokenV2");
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 3600;

      // Should fail when initial supply > max supply
      await expect(
        KlinkTokenFactory.deploy(
          owner.address,
          "KlinkToken",
          "KLINK",
          15000, // initial > max
          10000, // max
          futureTimestamp
        )
      ).to.be.revertedWith("initial > max");
    });

    it("Should allow initial supply equal to max supply", async function () {
      const KlinkTokenFactory = await ethers.getContractFactory("KlinkTokenV2");
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 3600;

      const token = await KlinkTokenFactory.deploy(
        owner.address,
        "KlinkToken",
        "KLINK",
        10000, // initial = max
        10000, // max
        futureTimestamp
      );

      expect(await token.totalSupply()).to.equal(ethers.parseEther("10000"));
      expect(await token.MAX_SUPPLY()).to.equal(ethers.parseEther("10000"));
    });

    it("Should correctly scale initial and max supply by decimals", async function () {
      expect(await klinkToken.totalSupply()).to.equal(ethers.parseEther(INITIAL_SUPPLY.toString()));
      expect(await klinkToken.MAX_SUPPLY()).to.equal(ethers.parseEther(MAX_SUPPLY.toString()));
      expect(await klinkToken.balanceOf(owner.address)).to.equal(ethers.parseEther(INITIAL_SUPPLY.toString()));
    });

    it("Should validate start timestamp is not in the past", async function () {
      const KlinkTokenFactory = await ethers.getContractFactory("KlinkTokenV2");
      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

      await expect(
        KlinkTokenFactory.deploy(
          owner.address,
          "KlinkToken",
          "KLINK",
          INITIAL_SUPPLY,
          MAX_SUPPLY,
          pastTimestamp
        )
      ).to.be.revertedWith("misconfig");
    });

    it("Should automatically whitelist the initial owner", async function () {
      expect(await klinkToken.whitelist(owner.address)).to.be.true;
    });
  });

  describe("Max Supply Enforcement", function () {
    it("Should prevent minting beyond max supply", async function () {
      const currentSupply = await klinkToken.totalSupply();
      const maxSupply = await klinkToken.MAX_SUPPLY();
      const remainingMintable = maxSupply - currentSupply;

      // Mint up to the limit
      await klinkToken.mint(addr1.address, remainingMintable);
      expect(await klinkToken.totalSupply()).to.equal(maxSupply);

      // Try to mint one more token - should fail
      await expect(klinkToken.mint(addr1.address, 1))
        .to.be.revertedWith("cap exceeded");
    });

    it("Should allow minting exactly to max supply", async function () {
      const currentSupply = await klinkToken.totalSupply();
      const maxSupply = await klinkToken.MAX_SUPPLY();
      const remainingMintable = maxSupply - currentSupply;

      await expect(klinkToken.mint(addr1.address, remainingMintable))
        .to.not.be.reverted;

      expect(await klinkToken.totalSupply()).to.equal(maxSupply);
    });

    it("Should handle partial minting when approaching max supply", async function () {
      const currentSupply = await klinkToken.totalSupply();
      const maxSupply = await klinkToken.MAX_SUPPLY();
      const remainingMintable = maxSupply - currentSupply;

      // Mint half of remaining
      const halfRemaining = remainingMintable / BigInt(2);
      await klinkToken.mint(addr1.address, halfRemaining);

      // Should be able to mint the rest
      const newRemaining = maxSupply - await klinkToken.totalSupply();
      await expect(klinkToken.mint(addr2.address, newRemaining))
        .to.not.be.reverted;

      expect(await klinkToken.totalSupply()).to.equal(maxSupply);
    });

    it("Should prevent minting when amount would exceed max supply", async function () {
      const currentSupply = await klinkToken.totalSupply();
      const maxSupply = await klinkToken.MAX_SUPPLY();
      const remainingMintable = maxSupply - currentSupply;

      // Try to mint more than remaining
      const excessAmount = remainingMintable + ethers.parseEther("1");
      await expect(klinkToken.mint(addr1.address, excessAmount))
        .to.be.revertedWith("cap exceeded");
    });

    it("Should allow burning and then minting again", async function () {
      // Burn some tokens
      const burnAmount = ethers.parseEther("100");
      await klinkToken.burn(burnAmount);

      const supplyAfterBurn = await klinkToken.totalSupply();
      expect(supplyAfterBurn).to.equal(ethers.parseEther((INITIAL_SUPPLY - 100).toString()));

      // Should be able to mint again
      await expect(klinkToken.mint(addr1.address, burnAmount))
        .to.not.be.reverted;

      expect(await klinkToken.totalSupply()).to.equal(ethers.parseEther(INITIAL_SUPPLY.toString()));
    });
  });

  describe("Timelock Functionality", function () {
    it("Should block transfers before timestamp for non-whitelisted addresses", async function () {
      // Remove owner from whitelist to test timelock properly
      await klinkToken.removeFromWhitelist(owner.address);
      
      const transferAmount = ethers.parseEther("100");

      // Transfer to non-whitelisted address should fail
      await expect(klinkToken.transfer(addr1.address, transferAmount))
        .to.be.revertedWith("not allowed");
    });

    it("Should allow transfers for whitelisted addresses before timestamp", async function () {
      const transferAmount = ethers.parseEther("100");

      // Owner is whitelisted by default, so transfer to addr1 should work
      await expect(klinkToken.transfer(addr1.address, transferAmount))
        .to.not.be.reverted;

      // Transfer from non-whitelisted addr1 to non-whitelisted addr2 should fail
      await expect(klinkToken.connect(addr1).transfer(addr2.address, ethers.parseEther("50")))
        .to.be.revertedWith("not allowed");

      // Add addr1 to whitelist, now transfer from addr1 to addr2 should work (sender is whitelisted)
      await klinkToken.addToWhitelist(addr1.address);
      await expect(klinkToken.connect(addr1).transfer(addr2.address, ethers.parseEther("50")))
        .to.not.be.reverted;
    });

    it("Should allow all transfers after timestamp passes", async function () {
      // Fast forward past the timestamp
      const currentTimestamp = await klinkToken.transferAllowedTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [Number(currentTimestamp) + 1]);
      await ethers.provider.send("evm_mine");

      const transferAmount = ethers.parseEther("100");

      // Transfer to non-whitelisted address should now work
      await expect(klinkToken.transfer(addr1.address, transferAmount))
        .to.not.be.reverted;

      // Transfer between non-whitelisted addresses should work
      await expect(klinkToken.connect(addr1).transfer(addr2.address, ethers.parseEther("50")))
        .to.not.be.reverted;
    });

    it("Should allow minting and burning regardless of timelock", async function () {
      const mintAmount = ethers.parseEther("500");
      const burnAmount = ethers.parseEther("100");

      // Minting should work even before timestamp
      await expect(klinkToken.mint(addr1.address, mintAmount))
        .to.not.be.reverted;

      // Burning should work even before timestamp
      await expect(klinkToken.burn(burnAmount))
        .to.not.be.reverted;
    });
  });

  describe("Timelock Edge Cases", function () {
    it("Should handle setting timestamp to exact current time", async function () {
      const currentTimestamp = (await getCurrentBlockTimestamp()) + 5; // Slightly future to avoid timing issues
      
      // Setting to near current time should work
      await expect(klinkToken.setTransferAllowedTimestamp(currentTimestamp))
        .to.not.be.reverted;
    });

    it("Should handle setting timestamp to future", async function () {
      // Remove owner from whitelist to test timelock properly
      await klinkToken.removeFromWhitelist(owner.address);
      
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 3600;
      
      await expect(klinkToken.setTransferAllowedTimestamp(futureTimestamp))
        .to.not.be.reverted;
      
      // Transfers should be blocked
      await expect(klinkToken.transfer(addr1.address, ethers.parseEther("10")))
        .to.be.revertedWith("not allowed");
    });

    it("Should prevent setting timestamp to past", async function () {
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 3600;
      
      await expect(klinkToken.setTransferAllowedTimestamp(futureTimestamp))
        .to.not.be.reverted;
      
      // Should NOT be able to set to past time
      const pastTimestamp = (await getCurrentBlockTimestamp()) - 3600; // 1 hour ago
      await expect(klinkToken.setTransferAllowedTimestamp(pastTimestamp))
        .to.be.revertedWith("past time");
    });

    it("Should enforce ETA cap after first timestamp passes", async function () {
      // Fast forward past the original timestamp
      const originalTimestamp = await klinkToken.transferAllowedTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [Number(originalTimestamp) + 1]);
      await ethers.provider.send("evm_mine");

      // Now try to set a timestamp beyond the 1-day cap
      const beyondCapTimestamp = Number(originalTimestamp) + (2 * 24 * 3600); // 2 days after original

      await expect(klinkToken.setTransferAllowedTimestamp(beyondCapTimestamp))
        .to.be.revertedWith("ETA!");
    });

    it("Should allow timestamp changes within ETA cap after launch", async function () {
      // Fast forward past the original timestamp
      const originalTimestamp = await klinkToken.transferAllowedTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [Number(originalTimestamp) + 1]);
      await ethers.provider.send("evm_mine");

      // Set timestamp within the 1-day cap
      const withinCapTimestamp = Number(originalTimestamp) + (12 * 3600); // 12 hours after original

      await expect(klinkToken.setTransferAllowedTimestamp(withinCapTimestamp))
        .to.emit(klinkToken, "NewTransferAllowedTimestamp")
        .withArgs(withinCapTimestamp);
    });

    it("Should handle multiple timestamp changes correctly", async function () {
      const currentTime = await getCurrentBlockTimestamp();
      const timestamp1 = currentTime + 7200; // 2 hours
      const timestamp2 = currentTime + 10800; // 3 hours

      // First change (pre-launch)
      await klinkToken.setTransferAllowedTimestamp(timestamp1);
      expect(await klinkToken.transferAllowedTimestamp()).to.equal(timestamp1);

      // Second change (still pre-launch)
      await klinkToken.setTransferAllowedTimestamp(timestamp2);
      expect(await klinkToken.transferAllowedTimestamp()).to.equal(timestamp2);
    });
  });

  describe("Timestamp Validation Edge Cases", function () {
    it("Should handle timestamp changes during restricted period", async function () {
      // Remove owner from whitelist to test timelock properly
      await klinkToken.removeFromWhitelist(owner.address);
      
      // Set initial restriction to slightly future time (allows transfers after a moment)
      const nearFutureTimestamp = (await getCurrentBlockTimestamp()) + 10;
      await klinkToken.setTransferAllowedTimestamp(nearFutureTimestamp);
      
      // Fast forward past the timestamp
      await ethers.provider.send("evm_increaseTime", [15]);
      await ethers.provider.send("evm_mine");
      
      // Should be able to transfer
      await expect(klinkToken.transfer(addr1.address, ethers.parseEther("10")))
        .to.not.be.reverted;
      
      // Change to future restriction
      const newTimestamp = (await getCurrentBlockTimestamp()) + 7200; // 2 hours from now
      await klinkToken.setTransferAllowedTimestamp(newTimestamp);
      
      // Should now be blocked
      await expect(klinkToken.transfer(addr1.address, ethers.parseEther("10")))
        .to.be.revertedWith("not allowed");
    });

    it("Should handle multiple timestamp updates", async function () {
      // Remove owner from whitelist to test timelock properly
      await klinkToken.removeFromWhitelist(owner.address);
      
      // First update
      const timestamp1 = (await getCurrentBlockTimestamp()) + 7200; // 2 hours
      const timestamp2 = (await getCurrentBlockTimestamp()) + 10800; // 3 hours
      
      await klinkToken.setTransferAllowedTimestamp(timestamp1);
      
      // Should be blocked
      await expect(klinkToken.transfer(addr1.address, ethers.parseEther("10")))
        .to.be.revertedWith("not allowed");
      
      // Update again
      await klinkToken.setTransferAllowedTimestamp(timestamp2);
      
      // Should still be blocked
      await expect(klinkToken.transfer(addr1.address, ethers.parseEther("10")))
        .to.be.revertedWith("not allowed");
      
      // Set to slightly future time (allows transfers after a moment)
      const nearFutureTime = (await getCurrentBlockTimestamp()) + 10;
      await klinkToken.setTransferAllowedTimestamp(nearFutureTime);
      
      // Fast forward past the timestamp
      await ethers.provider.send("evm_increaseTime", [15]);
      await ethers.provider.send("evm_mine");
      
      // Should now work
      await expect(klinkToken.transfer(addr1.address, ethers.parseEther("10")))
        .to.not.be.reverted;
    });
  });

  describe("Whitelist and Timelock Interaction Edge Cases", function () {
    it("Should handle whitelist changes during timelock", async function () {
      // Remove owner from whitelist first
      await klinkToken.removeFromWhitelist(owner.address);
      
      // Set timelock
      const newTimestamp = (await getCurrentBlockTimestamp()) + 7200;
      await klinkToken.setTransferAllowedTimestamp(newTimestamp);
      
      // Should be blocked for non-whitelisted
      await expect(klinkToken.transfer(addr1.address, ethers.parseEther("10")))
        .to.be.revertedWith("not allowed");
      
      // Add to whitelist
      await klinkToken.addToWhitelist(owner.address);
      
      // Should now work for whitelisted address
      await expect(klinkToken.transfer(addr1.address, ethers.parseEther("10")))
        .to.not.be.reverted;
      
      // Remove from whitelist
      await klinkToken.removeFromWhitelist(owner.address);
      
      // Should be blocked again
      await expect(klinkToken.transfer(addr1.address, ethers.parseEther("10")))
        .to.be.revertedWith("not allowed");
    });
  });

  describe("Whitelist Management", function () {
    it("Should add and remove addresses from whitelist", async function () {
      // Initially not whitelisted
      expect(await klinkToken.whitelist(addr1.address)).to.be.false;

      // Add to whitelist
      await expect(klinkToken.addToWhitelist(addr1.address))
        .to.emit(klinkToken, "WhitelistAdded")
        .withArgs(addr1.address);

      expect(await klinkToken.whitelist(addr1.address)).to.be.true;

      // Remove from whitelist
      await expect(klinkToken.removeFromWhitelist(addr1.address))
        .to.emit(klinkToken, "WhitelistRemoved")
        .withArgs(addr1.address);

      expect(await klinkToken.whitelist(addr1.address)).to.be.false;
    });

    it("Should handle adding same address multiple times", async function () {
      await klinkToken.addToWhitelist(addr1.address);
      await klinkToken.addToWhitelist(addr1.address);
      await klinkToken.addToWhitelist(addr1.address);

      expect(await klinkToken.whitelist(addr1.address)).to.be.true;
    });

    it("Should handle removing non-whitelisted address", async function () {
      // Should not revert
      await klinkToken.removeFromWhitelist(addr1.address);
      expect(await klinkToken.whitelist(addr1.address)).to.be.false;
    });

    it("Should handle zero address in whitelist", async function () {
      await klinkToken.addToWhitelist(ethers.ZeroAddress);
      expect(await klinkToken.whitelist(ethers.ZeroAddress)).to.be.true;

      await klinkToken.removeFromWhitelist(ethers.ZeroAddress);
      expect(await klinkToken.whitelist(ethers.ZeroAddress)).to.be.false;
    });
  });

  describe("Access Control", function () {
    it("Should only allow owner to set timestamp", async function () {
      const newTimestamp = Math.floor(Date.now() / 1000) + 7200;

      await expect(
        klinkToken.connect(addr1).setTransferAllowedTimestamp(newTimestamp)
      ).to.be.revertedWithCustomError(klinkToken, "OwnableUnauthorizedAccount");
    });

    it("Should only allow owner to manage whitelist", async function () {
      await expect(
        klinkToken.connect(addr1).addToWhitelist(addr2.address)
      ).to.be.revertedWithCustomError(klinkToken, "OwnableUnauthorizedAccount");

      await expect(
        klinkToken.connect(addr1).removeFromWhitelist(addr2.address)
      ).to.be.revertedWithCustomError(klinkToken, "OwnableUnauthorizedAccount");
    });

    it("Should only allow owner to mint", async function () {
      await expect(
        klinkToken.connect(addr1).mint(addr1.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(klinkToken, "OwnableUnauthorizedAccount");
    });

    it("Should only allow owner to burn", async function () {
      await expect(
        klinkToken.connect(addr1).burn(ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(klinkToken, "OwnableUnauthorizedAccount");
    });
  });

  describe("Edge Cases and Error Handling", function () {
    it("Should handle timestamp overflow scenarios", async function () {
      const maxSafeTimestamp = 2147483647; // Max 32-bit signed integer
      await klinkToken.setTransferAllowedTimestamp(maxSafeTimestamp);

      expect(await klinkToken.transferAllowedTimestamp()).to.equal(maxSafeTimestamp);
    });

    it("Should handle zero amount transfers", async function () {
      // Add addr1 to whitelist for testing
      await klinkToken.addToWhitelist(addr1.address);

      // Zero amount transfer should work
      await expect(klinkToken.transfer(addr1.address, 0))
        .to.not.be.reverted;
    });

    it("Should handle transfers to self", async function () {
      // Fast forward past timestamp
      const currentTimestamp = await klinkToken.transferAllowedTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [Number(currentTimestamp) + 1]);
      await ethers.provider.send("evm_mine");

      // Transfer to self should work
      await expect(klinkToken.transfer(owner.address, ethers.parseEther("100")))
        .to.not.be.reverted;
    });

    it("Should handle burning more than balance", async function () {
      const balance = await klinkToken.balanceOf(owner.address);
      const excessAmount = balance + BigInt(1);

      await expect(klinkToken.burn(excessAmount))
        .to.be.revertedWithCustomError(klinkToken, "ERC20InsufficientBalance");
    });

    it("Should handle minting to zero address", async function () {
      await expect(klinkToken.mint(ethers.ZeroAddress, ethers.parseEther("100")))
        .to.be.revertedWithCustomError(klinkToken, "ERC20InvalidReceiver");
    });

    it("Should handle very large amounts within max supply", async function () {
      const currentSupply = await klinkToken.totalSupply();
      const maxSupply = await klinkToken.MAX_SUPPLY();
      const largeAmount = maxSupply - currentSupply;

      // Should handle large amount if within limits
      await expect(klinkToken.mint(addr1.address, largeAmount))
        .to.not.be.reverted;
    });
  });

  describe("Integration with Standard ERC20 Functions", function () {
    it("Should handle approve and transferFrom with timelock", async function () {
      const transferAmount = ethers.parseEther("100");

      // First transfer tokens to addr1 (owner is whitelisted so this works)
      await klinkToken.transfer(addr1.address, transferAmount);
      
      // addr1 approves addr2 to spend tokens
      await klinkToken.connect(addr1).approve(addr2.address, transferAmount);

      // transferFrom should respect timelock (addr1 -> addr3, both non-whitelisted)
      await expect(
        klinkToken.connect(addr2).transferFrom(addr1.address, addr3.address, transferAmount)
      ).to.be.revertedWith("not allowed");

      // Add addr3 to whitelist
      await klinkToken.addToWhitelist(addr3.address);

      // Should now work (addr1 -> addr3, addr3 is whitelisted)
      await expect(
        klinkToken.connect(addr2).transferFrom(addr1.address, addr3.address, transferAmount)
      ).to.not.be.reverted;
    });

    it("Should handle allowance correctly", async function () {
      const allowanceAmount = ethers.parseEther("500");

      await klinkToken.approve(addr1.address, allowanceAmount);
      expect(await klinkToken.allowance(owner.address, addr1.address)).to.equal(allowanceAmount);

      // Update allowance to a higher amount
      const newAllowanceAmount = allowanceAmount + ethers.parseEther("100");
      await klinkToken.approve(addr1.address, newAllowanceAmount);
      expect(await klinkToken.allowance(owner.address, addr1.address)).to.equal(newAllowanceAmount);

      // Update allowance to a lower amount
      const finalAllowanceAmount = allowanceAmount - ethers.parseEther("100");
      await klinkToken.approve(addr1.address, finalAllowanceAmount);
      expect(await klinkToken.allowance(owner.address, addr1.address)).to.equal(finalAllowanceAmount);
    });
  });
});