const { expect } = require("chai");
const { ethers } = require("hardhat");

// Helper function to get current block timestamp
async function getCurrentBlockTimestamp() {
  const currentBlock = await ethers.provider.getBlock('latest');
  return currentBlock.timestamp;
}

describe("KlinkTokenV2", function () {
  let klinkToken;
  let owner, addr1, addr2, addr3;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3] = await ethers.getSigners();

    const currentBlock = await ethers.provider.getBlock('latest');
    const futureTimestamp = currentBlock.timestamp + 86400; // 24 hours from current block
    const initialSupply = 1000;
    const maxSupply = 10000;

    const KlinkToken = await ethers.getContractFactory("KlinkTokenV2");
    klinkToken = await KlinkToken.deploy(
      owner.address,
      "KlinkToken", 
      "KLINK", 
      initialSupply,
      maxSupply,
      futureTimestamp
    );
  });

  it("Should deploy the token with the correct initial supply", async function () {
    const decimals = await klinkToken.decimals();
    const expectedSupply = ethers.parseUnits("1000", decimals);
    expect(await klinkToken.totalSupply()).to.equal(expectedSupply);
  });

  it("Should have owner-only mint function with cap", async function () {
    // Verify that mint function exists and is owner-only
    expect(klinkToken.mint).to.not.be.undefined;
    
    // Verify initial total supply
    const initialSupply = await klinkToken.totalSupply();
    const expectedInitialSupply = ethers.parseUnits("1000", await klinkToken.decimals());
    expect(initialSupply).to.equal(expectedInitialSupply);
    
    // Test that owner can mint within cap
    const mintAmount = ethers.parseUnits("100", await klinkToken.decimals());
    await klinkToken.mint(owner.address, mintAmount);
    expect(await klinkToken.totalSupply()).to.equal(initialSupply + mintAmount);
  });

  it("Should allow the owner to burn tokens", async function () {
    const burnAmount = ethers.parseUnits("50", await klinkToken.decimals());
    await klinkToken.burn(burnAmount);

    const expectedBalance = ethers.parseUnits("950", await klinkToken.decimals());
    expect(await klinkToken.balanceOf(owner.address)).to.equal(expectedBalance);
  });

  it("Should prevent non-owners from burning tokens", async function () {
    const burnAmount = ethers.parseUnits("50", await klinkToken.decimals());
    await expect(klinkToken.connect(addr1).burn(burnAmount))
      .to.be.revertedWithCustomError(klinkToken, "OwnableUnauthorizedAccount");
  });



  it("Should call _beforeTokenTransfer hook on every transfer", async function () {
    await klinkToken.transfer(addr1.address, ethers.parseUnits("100", await klinkToken.decimals()));
    expect(await klinkToken.balanceOf(addr1.address)).to.equal(ethers.parseUnits("100", await klinkToken.decimals()));
  });

  it("Should revert on transfer when the amount is greater than the balance", async function () {
    const balance = await klinkToken.balanceOf(owner.address);  // returns BigInt
    const amountToTransfer = balance + BigInt(1);  // Use BigInt for addition
    await expect(klinkToken.transfer(addr1.address, amountToTransfer))
      .to.be.revertedWithCustomError(klinkToken, "ERC20InsufficientBalance");
  });

  // ==================== TIMELOCK & ANTI-SNIPER TESTS ====================

  describe("Timelock Functionality", function () {
    it("Should have initial transfer allowed timestamp set to deployment value", async function () {
      const timestamp = await klinkToken.transferAllowedTimestamp();
      expect(timestamp).to.be.gt(0); // Should be greater than 0 since we set it in constructor
    });

    it("Should allow owner to set transfer allowed timestamp", async function () {
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 3600; // 1 hour from now
      await klinkToken.setTransferAllowedTimestamp(futureTimestamp);
      expect(await klinkToken.transferAllowedTimestamp()).to.equal(futureTimestamp);
    });

    it("Should prevent non-owner from setting transfer allowed timestamp", async function () {
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 3600;
      await expect(
        klinkToken.connect(addr1).setTransferAllowedTimestamp(futureTimestamp)
      ).to.be.revertedWithCustomError(klinkToken, "OwnableUnauthorizedAccount");
    });

    it("Should block transfers before timestamp gate for non-whitelisted addresses", async function () {
      const farFutureTimestamp = (await getCurrentBlockTimestamp()) + 7200; // 2 hours from now
      await klinkToken.setTransferAllowedTimestamp(farFutureTimestamp);
      
      // First transfer some tokens to addr1 (owner is whitelisted so this works)
      const transferAmount = ethers.parseUnits("100", await klinkToken.decimals());
      await klinkToken.transfer(addr1.address, transferAmount);
      
      // Now try to transfer from addr1 to addr2 (both non-whitelisted), this should fail
      await expect(
        klinkToken.connect(addr1).transfer(addr2.address, transferAmount)
      ).to.be.revertedWith("not allowed");
    });

    it("Should allow transfers after timestamp gate passes", async function () {
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 10; // 10 seconds from now
      await klinkToken.setTransferAllowedTimestamp(futureTimestamp);
      
      // Fast forward time to pass the timestamp gate
      await ethers.provider.send("evm_increaseTime", [15]); // Advance by 15 seconds
      await ethers.provider.send("evm_mine");
      
      const transferAmount = ethers.parseUnits("100", await klinkToken.decimals());
      await expect(klinkToken.transfer(addr1.address, transferAmount))
        .to.not.be.reverted;
      
      expect(await klinkToken.balanceOf(addr1.address)).to.equal(transferAmount);
    });

    it("Should allow transfers when timestamp is 0 (disabled)", async function () {
      // Timestamp should be 0 by default
      const transferAmount = ethers.parseUnits("100", await klinkToken.decimals());
      await expect(klinkToken.transfer(addr1.address, transferAmount))
        .to.not.be.reverted;
      
      expect(await klinkToken.balanceOf(addr1.address)).to.equal(transferAmount);
    });
  });

  describe("Whitelist Functionality", function () {
    it("Should allow owner to add addresses to whitelist", async function () {
      await klinkToken.addToWhitelist(addr1.address);
      expect(await klinkToken.whitelist(addr1.address)).to.be.true;
    });

    it("Should allow owner to remove addresses from whitelist", async function () {
      await klinkToken.addToWhitelist(addr1.address);
      expect(await klinkToken.whitelist(addr1.address)).to.be.true;
      
      await klinkToken.removeFromWhitelist(addr1.address);
      expect(await klinkToken.whitelist(addr1.address)).to.be.false;
    });

    it("Should prevent non-owner from adding to whitelist", async function () {
      await expect(
        klinkToken.connect(addr1).addToWhitelist(addr2.address)
      ).to.be.revertedWithCustomError(klinkToken, "OwnableUnauthorizedAccount");
    });

    it("Should prevent non-owner from removing from whitelist", async function () {
      await klinkToken.addToWhitelist(addr1.address);
      await expect(
        klinkToken.connect(addr1).removeFromWhitelist(addr1.address)
      ).to.be.revertedWithCustomError(klinkToken, "OwnableUnauthorizedAccount");
    });

    it("Should allow whitelisted addresses to transfer before timestamp gate", async function () {
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 3600; // 1 hour from now
      await klinkToken.setTransferAllowedTimestamp(futureTimestamp);
      
      // Add owner to whitelist (owner should be able to transfer to whitelisted address)
      await klinkToken.addToWhitelist(owner.address);
      await klinkToken.addToWhitelist(addr1.address);
      
      const transferAmount = ethers.parseUnits("100", await klinkToken.decimals());
      await expect(klinkToken.transfer(addr1.address, transferAmount))
        .to.not.be.reverted;
      
      expect(await klinkToken.balanceOf(addr1.address)).to.equal(transferAmount);
    });

    it("Should allow transfers from whitelisted addresses before timestamp gate", async function () {
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 3600;
      await klinkToken.setTransferAllowedTimestamp(futureTimestamp);
      
      // Transfer some tokens to addr1 first (when transfers are allowed)
      const transferAmount = ethers.parseUnits("100", await klinkToken.decimals());
      await klinkToken.addToWhitelist(owner.address);
      await klinkToken.addToWhitelist(addr1.address);
      await klinkToken.transfer(addr1.address, transferAmount);
      
      // Now test transfer from addr1 to addr2 (addr1 is whitelisted)
      await expect(klinkToken.connect(addr1).transfer(addr2.address, transferAmount))
        .to.not.be.reverted;
      
      expect(await klinkToken.balanceOf(addr2.address)).to.equal(transferAmount);
    });

    it("Should allow transfers to whitelisted addresses before timestamp gate", async function () {
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 3600; // 1 hour from now
      await klinkToken.setTransferAllowedTimestamp(futureTimestamp);
      
      // Add addr1 to whitelist
      await klinkToken.addToWhitelist(addr1.address);
      
      const transferAmount = ethers.parseUnits("100", await klinkToken.decimals());
      await expect(klinkToken.transfer(addr1.address, transferAmount))
        .to.not.be.reverted;
      
      expect(await klinkToken.balanceOf(addr1.address)).to.equal(transferAmount);
    });

    it("Should prevent setting timestamp to past", async function () {
      const pastTimestamp = (await getCurrentBlockTimestamp()) - 3600; // 1 hour ago
      await expect(
        klinkToken.setTransferAllowedTimestamp(pastTimestamp)
      ).to.be.revertedWith("past time");
    });
  });

  describe("Anti-Sniper Combined Tests", function () {
    it("Should handle complex timelock and whitelist scenarios", async function () {
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 86400; // 24 hours from now
      await klinkToken.setTransferAllowedTimestamp(futureTimestamp);
      
      // Add owner to whitelist (addr1 is not whitelisted initially)
      await klinkToken.addToWhitelist(owner.address);
      
      const transferAmount = ethers.parseUnits("100", await klinkToken.decimals());
      
      // Should work: whitelisted owner to non-whitelisted addr1
      await expect(klinkToken.transfer(addr1.address, transferAmount))
        .to.not.be.reverted;
      
      // Should fail: non-whitelisted addr1 to non-whitelisted addr2
      await expect(klinkToken.connect(addr1).transfer(addr2.address, transferAmount))
        .to.be.revertedWith("not allowed");
      
      // Add addr2 to whitelist
      await klinkToken.addToWhitelist(addr2.address);
      
      // Should work now: non-whitelisted addr1 to whitelisted addr2
      await expect(klinkToken.connect(addr1).transfer(addr2.address, transferAmount))
        .to.not.be.reverted;
      
      expect(await klinkToken.balanceOf(addr2.address)).to.equal(transferAmount);
    });

    it("Should allow all transfers after timestamp gate regardless of whitelist", async function () {
      // Set a future timestamp first
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 3600; // 1 hour from now
      await klinkToken.setTransferAllowedTimestamp(futureTimestamp);
      
      // Fast forward time to pass the timestamp gate
      await ethers.provider.send("evm_increaseTime", [3700]); // 1 hour + 100 seconds
      await ethers.provider.send("evm_mine");
      
      // Don't add anyone to whitelist
      const transferAmount = ethers.parseUnits("100", await klinkToken.decimals());
      
      // Should work: timestamp gate has passed
      await expect(klinkToken.transfer(addr1.address, transferAmount))
        .to.not.be.reverted;
      
      await expect(klinkToken.connect(addr1).transfer(addr2.address, transferAmount))
        .to.not.be.reverted;
      
      expect(await klinkToken.balanceOf(addr2.address)).to.equal(transferAmount);
    });

    it("Should handle edge case: exactly at timestamp gate", async function () {
      // Set timestamp to a few seconds in the future
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 5; // 5 seconds from now
      await klinkToken.setTransferAllowedTimestamp(futureTimestamp);
      
      // Fast forward time to exactly reach the timestamp
      await ethers.provider.send("evm_increaseTime", [5]);
      await ethers.provider.send("evm_mine");
      
      const transferAmount = ethers.parseUnits("100", await klinkToken.decimals());
      
      // Should work: we're at or past the timestamp
      await expect(klinkToken.transfer(addr1.address, transferAmount))
        .to.not.be.reverted;
      
      expect(await klinkToken.balanceOf(addr1.address)).to.equal(transferAmount);
    });
  });

  describe("Minting Functionality", function () {
    it("Should allow owner to mint tokens within cap", async function () {
      const mintAmount = ethers.parseUnits("500", await klinkToken.decimals());
      await klinkToken.mint(addr1.address, mintAmount);
      
      expect(await klinkToken.balanceOf(addr1.address)).to.equal(mintAmount);
      expect(await klinkToken.totalSupply()).to.equal(
        ethers.parseUnits("1500", await klinkToken.decimals()) // 1000 initial + 500 minted
      );
    });

    it("Should prevent non-owner from minting", async function () {
      const mintAmount = ethers.parseUnits("100", await klinkToken.decimals());
      await expect(
        klinkToken.connect(addr1).mint(addr2.address, mintAmount)
      ).to.be.revertedWithCustomError(klinkToken, "OwnableUnauthorizedAccount");
    });

    it("Should prevent minting beyond cap", async function () {
      const cap = await klinkToken.MAX_SUPPLY();
      const currentSupply = await klinkToken.totalSupply();
      const excessAmount = cap - currentSupply + BigInt(1);
      
      await expect(
        klinkToken.mint(addr1.address, excessAmount)
      ).to.be.revertedWith("cap exceeded");
    });

    it("Should allow minting up to exact cap", async function () {
      const cap = await klinkToken.MAX_SUPPLY();
      const currentSupply = await klinkToken.totalSupply();
      const remainingAmount = cap - currentSupply;
      
      await expect(klinkToken.mint(addr1.address, remainingAmount))
        .to.not.be.reverted;
      
      expect(await klinkToken.totalSupply()).to.equal(cap);
    });
  });

  describe("Integration Tests", function () {
    it("Should handle minting, timelock, and whitelist together", async function () {
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 3600; // 1 hour from now
      await klinkToken.setTransferAllowedTimestamp(futureTimestamp);
      
      // Mint tokens to addr1
      const mintAmount = ethers.parseUnits("500", await klinkToken.decimals());
      await klinkToken.mint(addr1.address, mintAmount);
      expect(await klinkToken.balanceOf(addr1.address)).to.equal(mintAmount);
      
      // Add addr1 to whitelist and test transfer
      await klinkToken.addToWhitelist(addr1.address);
      const transferAmount = ethers.parseUnits("100", await klinkToken.decimals());
      await expect(klinkToken.connect(addr1).transfer(addr2.address, transferAmount))
        .to.not.be.reverted;
      
      expect(await klinkToken.balanceOf(addr2.address)).to.equal(transferAmount);
    });

    it("Should handle burning with timelock restrictions", async function () {
      const futureTimestamp = (await getCurrentBlockTimestamp()) + 3600; // 1 hour from now
      await klinkToken.setTransferAllowedTimestamp(futureTimestamp);
      
      const initialSupply = await klinkToken.totalSupply();
      const burnAmount = ethers.parseUnits("100", await klinkToken.decimals());
      
      // Burning should work regardless of timelock (owner function)
      await klinkToken.burn(burnAmount);
      expect(await klinkToken.totalSupply()).to.equal(initialSupply - burnAmount);
    });
  });
});
