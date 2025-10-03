// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// OpenZeppelin v5
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title KlinkTokenV2 
/// @notice
/// - Blocks transfers until `transferAllowedTimestamp` for non-whitelisted addresses.
/// - Enforces a hard max supply cap.
/// - After the first timestamp passes, subsequent timestamp extensions are capped.
/// - Uses OZ v5's `_update` transfer hook.
/// - Uses Ownable2Step for safer ownership transfers.
/// @dev
/// - `initialSupply` and `maxSupply` are **whole tokens**; contract scales by `10**decimals()`.
/// - Owner is set via constructor (`initialOwner`), recommended to be a Safe multisig.
contract KlinkTokenV2 is ERC20, Ownable2Step {
    /// @notice Public trading start (Unix time). Before this time, only whitelisted can transfer.
    uint256 public transferAllowedTimestamp;

    /// @dev Max extend cap after first timestamp passes: original + 1 day (set lazily).
    uint256 internal _etaCap;

    /// @notice Hard maximum total supply (in wei, 18 decimals).
    uint256 public immutable MAX_SUPPLY;

    /// @notice Whitelisted addresses allowed to transfer before `transferAllowedTimestamp`.
    mapping(address => bool) public whitelist;

    /// @dev Events
    event NewTransferAllowedTimestamp(uint256 newTimestamp);
    event WhitelistAdded(address indexed user);
    event WhitelistRemoved(address indexed user);

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    /// @param initialOwner      Owner address (set this to your Safe multisig).
    /// @param name_             Token name.
    /// @param symbol_           Token symbol.
    /// @param initialSupply     Initial supply in WHOLE tokens (auto-scaled by 10**decimals()).
    /// @param maxSupply         Maximum total supply in WHOLE tokens (auto-scaled by 10**decimals()).
    /// @param startTimestamp    Public trading start (must be >= now).
    constructor(
        address initialOwner,
        string memory name_,
        string memory symbol_,
        uint256 initialSupply,
        uint256 maxSupply,
        uint256 startTimestamp
    )
        ERC20(name_, symbol_)
        Ownable(initialOwner) // OZ v5 requires passing initialOwner here
    {
        require(initialOwner != address(0), "invalid owner");
        require(startTimestamp >= block.timestamp, "misconfig");
        require(initialSupply <= maxSupply, "initial > max");

        transferAllowedTimestamp = startTimestamp;

        uint256 scale = 10 ** decimals();
        MAX_SUPPLY = maxSupply * scale;

        // Allow initialOwner (Safe) to operate before public start (LP add, CEX ops, etc.)
        whitelist[initialOwner] = true;

        // Mint initial supply to owner (Safe). Scale to decimals (18 by default).
        _mint(initialOwner, initialSupply * scale);
    }

    // ---------------------------------------------------------------------
    // Admin (owner = Safe)
    // ---------------------------------------------------------------------

    /// @notice Update the transfer start timestamp.
    /// @dev Stricter validation: cannot set timestamp to the past (prevents backdating unlocks).
    function setTransferAllowedTimestamp(uint256 newTimestamp) external onlyOwner {
        require(newTimestamp >= block.timestamp, "past time");

        if (transferAllowedTimestamp > block.timestamp && _etaCap == 0) {
            // Pre-launch: first change is unrestricted (but cannot be in the past due to require above)
            transferAllowedTimestamp = newTimestamp;
        } else {
            // Post-launch or subsequent updates: cap to original + 1 day
            if (_etaCap == 0) {
                _etaCap = transferAllowedTimestamp + 1 days;
            }
            require(newTimestamp <= _etaCap, "ETA!");
            transferAllowedTimestamp = newTimestamp;
        }
        emit NewTransferAllowedTimestamp(newTimestamp);
    }

    /// @notice Add a pre-launch privileged address.
    function addToWhitelist(address user) external onlyOwner {
        require(user != address(0), "invalid address");
        whitelist[user] = true;
        emit WhitelistAdded(user);
    }

    /// @notice Remove a pre-launch privileged address.
    function removeFromWhitelist(address user) external onlyOwner {
        require(user != address(0), "invalid address");
        whitelist[user] = false;
        emit WhitelistRemoved(user);
    }

    /// @notice Owner-only mint (reserve/ops), respecting MAX_SUPPLY.
    function mint(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "invalid address");
        require(totalSupply() + amount <= MAX_SUPPLY, "cap exceeded");
        _mint(to, amount);
    }

    /// @notice Owner-only self-burn (burns from the owner's balance).
    function burn(uint256 amount) external onlyOwner {
        _burn(_msgSender(), amount);
    }

    // ---------------------------------------------------------------------
    // Transfer gate (OZ v5 uses _update)
    // ---------------------------------------------------------------------
    /// @dev Gate applies only to real transfers (both endpoints non-zero). Mint/burn bypass is allowed.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            require(
                block.timestamp >= transferAllowedTimestamp || whitelist[from] || whitelist[to],
                "not allowed"
            );
        }
        super._update(from, to, value);
    }

    // ---------------------------------------------------------------------
    // Optional: guard against accidental loss of admin (uncomment to use)
    // ---------------------------------------------------------------------
    // function renounceOwnership() public view override onlyOwner {
    //     revert("disabled");
    // }
}
