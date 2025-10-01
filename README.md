# Klink Contracts

A comprehensive smart contract ecosystem featuring KlinkToken V2 with anti-sniper protection and a sophisticated staking contract with timelock functionality and dynamic reward rates.

## 📋 Table of Contents

- [Overview](#overview)
- [Contracts](#contracts)
  - [KlinkToken V2](#klinktoken-v2)
  - [IDOLocking (Staking Contract)](#idolocking-staking-contract)


## 🔍 Overview

This repository contains two main smart contracts:

1. **KlinkToken V2**: An advanced ERC20 token with anti-sniper protection, whitelist functionality, and capped supply
2. **IDOLocking**: A sophisticated staking contract with timelock mechanisms, dynamic interest rates, and reward distribution

## 📄 Contracts

### KlinkToken V2

**File**: `contracts/KlinkToken.sol`

An enhanced ERC20 token implementation with advanced security features and supply management.

#### Key Features:

- **Anti-Sniper Protection**: Blocks transfers until a specified timestamp for non-whitelisted addresses
- **Whitelist System**: Allows privileged addresses to transfer before public trading starts
- **Capped Supply**: Hard maximum supply limit to prevent inflation
- **Timestamp Gate**: Configurable trading start time with extension limits
- **Owner Controls**: Mint, burn, and whitelist management functions
- **OpenZeppelin v5**: Built on the latest OpenZeppelin contracts for security

#### Contract Parameters:

- `initialOwner`: Owner address (recommended: Safe multisig)
- `name_`: Token name
- `symbol_`: Token symbol  
- `initialSupply`: Initial supply in whole tokens (auto-scaled by decimals)
- `maxSupply`: Maximum total supply in whole tokens (auto-scaled by decimals)
- `startTimestamp`: Public trading start time (Unix timestamp)

#### Key Functions:

- `setTransferAllowedTimestamp()`: Update trading start time (owner only)
- `addToWhitelist()` / `removeFromWhitelist()`: Manage privileged addresses
- `mint()`: Mint new tokens (owner only, respects max supply)
- `burn()`: Burn tokens from owner's balance

#### Timestamp Management Rules:

The `setTransferAllowedTimestamp()` function has specific rules to prevent abuse while allowing necessary adjustments:

| Situation | `_etaCap` | New Time Allowed? | Why |
|-----------|-----------|-------------------|-----|
| First pre-launch change to any future time | `0` | ✅ | First change is unrestricted (but not in the past) |
| Second pre-launch change beyond (original + 1 day) | `set` | ❌ | Exceeds cap ETA! |
| Second pre-launch change ≤ (original + 1 day) | `set` | ✅ | Within cap |
| Any change to a past time | `(any)` | ❌ | Fails `require(newTimestamp >= block.timestamp)` |
| First post-launch change ≤ (original + 1 day) | `becomes set` | ✅ | Cap set lazily; within cap |
| Any later change > cap | `set` | ❌ | Exceeds cap |

**Key Points:**
- The first timestamp change sets the `_etaCap` to `original + 1 day`
- All subsequent changes must be within this cap
- Past timestamps are never allowed
- This prevents excessive delays while allowing reasonable adjustments

### IDOLocking (Staking Contract)

**File**: `contracts/Staking.sol`

A comprehensive staking contract with timelock functionality, dynamic interest rates, and reward distribution mechanisms.

#### Key Features:

- **Timelock Mechanism**: Configurable lock duration (specified in hours, stored in seconds)
- **Dynamic Interest Rates**: Owner can update rates that apply to future stakes
- **Reward Pool Management**: Separate reward balance for interest payments
- **Staking Cap**: Maximum total staking limit to control pool size
- **Emergency Withdrawal**: Principal-only withdrawal option
- **Multi-Signature Support**: Gnosis Safe integration for admin functions

#### Contract Parameters:

- `name_`: Contract name identifier
- `tokenAddress_`: Address of the token to be staked
- `rate_`: Interest rate (multiplied by 100, e.g., 500 = 5%)
- `lockDuration_`: Lock period in hours (converted to seconds internally)
- `cap_`: Maximum staking capacity in whole tokens
- `gnosisSafeAddress_`: Gnosis Safe address for admin functions

#### Key Functions:

**User Functions:**
- `stake(amount)`: Stake tokens with timelock
- `withdraw()`: Withdraw principal + rewards after lock period
- `emergencyWithdraw()`: Withdraw only principal (no rewards)
- `calculate(address)`: View pending rewards for an address
- `userDeposits(address)`: View user's deposit information

**Admin Functions:**
- `setRateAndLockduration()`: Update interest rate and lock duration
- `addReward()`: Add tokens to the reward pool

#### Staking Mechanics:

1. **Lock Duration**: Tokens are locked for the specified duration (in hours)
2. **Interest Calculation**: Rewards calculated based on:
   - Staked amount
   - Lock duration
   - Current interest rate
   - Time-weighted rate changes
3. **Compound Staking**: Users can add to existing stakes (resets lock period)
4. **Rate Updates**: New rates apply to future stakes and compound additions

