const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("KlinkToken", function () {
  let klinkToken;
  let owner, addr1, addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const KlinkToken = await ethers.getContractFactory("KlinkToken");
    klinkToken = await KlinkToken.deploy("KlinkToken", "KLINK", 1000);
  });

  it("Should deploy the token with the correct initial supply", async function () {
    const decimals = await klinkToken.decimals();
    const expectedSupply = ethers.parseUnits("1000", decimals);
    expect(await klinkToken.totalSupply()).to.equal(expectedSupply);
  });

  it("Should have fixed supply with no mint function", async function () {
    // Verify that mint function doesn't exist
    expect(klinkToken.mint).to.be.undefined;
    
    // Verify total supply is fixed
    const totalSupply = await klinkToken.totalSupply();
    const expectedSupply = ethers.parseUnits("1000", await klinkToken.decimals());
    expect(totalSupply).to.equal(expectedSupply);
  });

  it("Should allow the owner to burn tokens", async function () {
    const burnAmount = ethers.parseUnits("50", await klinkToken.decimals());
    await klinkToken.burn(burnAmount);

    const expectedBalance = ethers.parseUnits("950", await klinkToken.decimals());
    expect(await klinkToken.balanceOf(owner.address)).to.equal(expectedBalance);
  });

  it("Should prevent non-owners from burning tokens", async function () {
    const burnAmount = ethers.parseUnits("50", await klinkToken.decimals());
    await expect(klinkToken.connect(addr1).burn(burnAmount)).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Should allow the owner to burn tokens from a specific account", async function () {
    const burnAmount = ethers.parseUnits("50", await klinkToken.decimals());
  
    // Transfer tokens to addr1 first
    await klinkToken.transfer(addr1.address, burnAmount);
  
    // Approve the owner to spend addr1's tokens
    await klinkToken.connect(addr1).approve(owner.address, burnAmount);
  
    // Now the owner can burn tokens from addr1's account
    await klinkToken.burnFrom(addr1.address, burnAmount);
  
    // Check the final balance of addr1
    expect(await klinkToken.balanceOf(addr1.address)).to.equal(0);
  });
  

  it("Should prevent non-owners from burning tokens from other accounts", async function () {
    const burnAmount = ethers.parseUnits("50", await klinkToken.decimals());
    await expect(klinkToken.connect(addr1).burnFrom(owner.address, burnAmount)).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Should call _beforeTokenTransfer hook on every transfer", async function () {
    await klinkToken.transfer(addr1.address, ethers.parseUnits("100", await klinkToken.decimals()));
    expect(await klinkToken.balanceOf(addr1.address)).to.equal(ethers.parseUnits("100", await klinkToken.decimals()));
  });

  it("Should revert on transfer when the amount is greater than the balance", async function () {
    const balance = await klinkToken.balanceOf(owner.address);  // returns BigInt
    const amountToTransfer = balance + BigInt(1);  // Use BigInt for addition
    await expect(klinkToken.transfer(addr1.address, amountToTransfer)).to.be.revertedWith(
        "ERC20: transfer amount exceeds balance"
    );
});
});
