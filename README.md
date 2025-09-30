# Klink Contracts

A comprehensive smart contract ecosystem featuring KlinkToken V2 with anti-sniper protection and a sophisticated staking contract with timelock functionality and dynamic reward rates.

## 📋 Table of Contents

- [Overview](#overview)
- [Contracts](#contracts)
  - [KlinkToken V2](#klinktoken-v2)
  - [IDOLocking (Staking Contract)](#idolocking-staking-contract)
- [Features](#features)
- [Installation](#installation)
- [Deployment](#deployment)
- [Usage](#usage)
- [Testing](#testing)
- [Security](#security)
- [License](#license)

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

## ✨ Features

### KlinkToken V2 Features:

- ✅ **Anti-Sniper Protection**: Prevents bot trading before official launch
- ✅ **Whitelist System**: Allows team/partners to operate before public launch
- ✅ **Supply Cap**: Hard limit prevents unlimited inflation
- ✅ **Timestamp Controls**: Flexible launch timing with safety limits
- ✅ **Owner Controls**: Comprehensive admin functions
- ✅ **OpenZeppelin v5**: Latest security standards

### Staking Contract Features:

- ✅ **Flexible Timelock**: Configurable lock periods
- ✅ **Dynamic Rates**: Adjustable interest rates
- ✅ **Reward Pool**: Separate reward management
- ✅ **Staking Cap**: Pool size controls
- ✅ **Emergency Options**: Principal recovery mechanism
- ✅ **Multi-Sig Ready**: Gnosis Safe integration
- ✅ **Compound Staking**: Add to existing positions

## 🚀 Installation

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Hardhat

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd klink-contracts
```

2. Install dependencies:
```bash
npm install
```

3. Install Hardhat locally:
```bash
npm install --save-dev hardhat@^2.22.0
```

4. Install OpenZeppelin contracts:
```bash
npm install @openzeppelin/contracts
```

## 🔧 Deployment

### Environment Setup

1. Create a `.env` file:
```env
PRIVATE_KEY=your_private_key_here
INFURA_PROJECT_ID=your_infura_project_id
ETHERSCAN_API_KEY=your_etherscan_api_key
```

### Deploy KlinkToken V2

```javascript
// Example deployment script
const KlinkTokenV2 = await ethers.getContractFactory("KlinkTokenV2");
const token = await KlinkTokenV2.deploy(
    "0x...", // initialOwner (Safe multisig)
    "Klink Token", // name
    "KLINK", // symbol
    1000000, // initialSupply (1M tokens)
    10000000, // maxSupply (10M tokens)
    Math.floor(Date.now() / 1000) + 3600 // startTimestamp (1 hour from now)
);
```

### Deploy Staking Contract

```javascript
// Example deployment script
const IDOLocking = await ethers.getContractFactory("IDOLocking");
const staking = await IDOLocking.deploy(
    "Klink Staking V1", // name
    tokenAddress, // token contract address
    500, // rate (5% = 500)
    720, // lockDuration (30 days = 720 hours)
    1000000, // cap (1M tokens)
    "0x..." // gnosisSafeAddress
);
```

## 📖 Usage

### KlinkToken V2 Usage

```javascript
// Add address to whitelist (before launch)
await token.addToWhitelist("0x...");

// Mint additional tokens (owner only)
await token.mint("0x...", ethers.utils.parseEther("1000"));

// Update trading start time
await token.setTransferAllowedTimestamp(newTimestamp);
```

### Staking Contract Usage

```javascript
// Approve tokens for staking
await token.approve(stakingAddress, ethers.utils.parseEther("1000"));

// Stake tokens
await staking.stake(ethers.utils.parseEther("1000"));

// Check rewards
const rewards = await staking.calculate(userAddress);

// Withdraw after lock period
await staking.withdraw();
```

## 🧪 Testing

Run the test suite:

```bash
# Compile contracts
npx hardhat compile

# Run all tests
npx hardhat test

# Run specific test file
npx hardhat test test/tokenTest.js
npx hardhat test test/stakingTest.js
```

### Test Coverage

- ✅ Token deployment and initialization
- ✅ Anti-sniper protection mechanisms
- ✅ Whitelist functionality
- ✅ Supply cap enforcement
- ✅ Staking and withdrawal flows
- ✅ Interest rate calculations
- ✅ Timelock mechanisms
- ✅ Emergency withdrawal scenarios

## 🔒 Security

### Security Features

- **OpenZeppelin Contracts**: Industry-standard security implementations
- **Access Controls**: Owner-only functions with proper modifiers
- **Input Validation**: Comprehensive parameter checking
- **Reentrancy Protection**: SafeERC20 usage for token transfers
- **Overflow Protection**: Solidity 0.8+ built-in overflow checks

### Audit Recommendations

- Multi-signature wallet for contract ownership
- Time-locked admin functions for critical operations
- Regular security audits for production deployments
- Comprehensive testing before mainnet deployment

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📞 Support

For questions and support, please contact the development team or create an issue in the repository.

---

**⚠️ Disclaimer**: These smart contracts are provided as-is. Always conduct thorough testing and security audits before deploying to mainnet.

