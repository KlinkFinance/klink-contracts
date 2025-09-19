// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// Import OpenZeppelin contracts for ERC20, ERC20Burnable, and Ownable functionality
import "@openzeppelin/contracts@4.9.6/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts@4.9.6/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts@4.9.6/access/Ownable.sol";

/**
 * @title KlinkToken
 * @dev Implementation of the ERC20 token with burn functionality and fixed supply.
 */
contract KlinkToken is ERC20, ERC20Burnable, Ownable {

    /**
     * @dev Constructor initializes the ERC20 token with a name, symbol, and fixed initial supply.
     *      The initial supply is assigned to the deployer of the contract.
     * @param name Name of the token.
     * @param symbol Symbol of the token.
     * @param initialSupply Initial supply of tokens (in smallest units, e.g., wei).
     */
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply
    ) ERC20(name, symbol) {
        _mint(msg.sender, initialSupply * 10 ** decimals());
    }

    /**
     * @dev Burn tokens from the owner's account.
     *      Overrides the burn function from ERC20Burnable.
     *      Can only be called by the owner.
     * @param amount Amount of tokens to burn.
     */
    function burn(uint256 amount) public override onlyOwner {
        super.burn(amount);
    }

    /**
     * @dev Burn tokens from a specific account, reducing the allowance first.
     *      Overrides the burnFrom function from ERC20Burnable.
     *      Can only be called by the owner.
     * @param account Address whose tokens will be burned.
     * @param amount Amount of tokens to burn.
     */
    function burnFrom(address account, uint256 amount) public override onlyOwner {
        super.burnFrom(account, amount);
    }

    /**
     * @dev Hook that is called before any transfer of tokens. This includes
     *      minting (only during deployment) and burning.
     * @param from Address sending the tokens.
     * @param to Address receiving the tokens.
     * @param amount Amount of tokens being transferred.
     */
    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override(ERC20) {
        super._beforeTokenTransfer(from, to, amount);
    }
}
