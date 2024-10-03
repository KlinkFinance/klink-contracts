# Klink SMART CONTRACTS

### INTRODUCTION

The Klink Smart contracts has a Vesting and Token Contract .The tokens will be Locked For multiple wallet address according to the vesting cycle added by owner of contract .

### Constants
- Unlock interval 30 days

### Deployment Needs
- Token Contract 
- Vesting Contract 

### VESTING CONTRACT ACTORS

## OWNER
- The owner of the smart contract is the wallet address that deploys the smart contract.
- The owner is able to allocate tokens to the beneficiaries. The allocation implies that the token balance of the smart contract suffices for that allocation.
    - For example, the balance of the smart contract is 100,000 TOKENS; the maximum amount that can be allocated is 100,000 tokens.
- The token allocation locks the tokens and makes them redeemable only from the beneficiary according to the unlock percentage and interval.
- Any un-allocated tokens can be withdrawn by the smart contract owner.
- The owner can add multiple allocations to a beneficiary.

## Beneficiaries
- Beneficiaries on the smart contract are wallet addresses that have tokens locked on the smart contract that can be withdrawn by them.
- Beneficiaries will only be able to withdraw the unlocked tokens allocated their address from the smart contract.
- After each unlocks period, the % of tokens  will be unlocked for each allocation, and the beneficiary will be able to withdraw all the tokens that are unlocked until that point in time.

### How to use

- The smart contract should be topped up with tokens, which is a simple token transfer to the smart contract by any wallet address.
- The owner of the smart contract will then be able to allocate tokens to any of the beneficiaries, with the restriction that the allocation should be limited to the amount of tokens held by the smart contract.
    - To start vesting owner can call `addVestingFromNow(address user, uint256 amount, uint256 _startAmount,uint256 _months)` method.
    - It's also possible to start westing from some date in the future by calling `address user, uint256 amount, uint256 startedAt , uint256 _startAmount,uint256 _months`
    - In case owner add vesting several times for the same beneficiary the smart contract will keep track on this separate allocations using `vestingId` (per beneficiary)

- When an allocation takes place, the amount of tokens specified on the allocation will be locked on the smart contract and can be redeemed by the beneficiary only. The tokens will be unlocked according to the vesting cycle.
    - User e.g `beneficiary` can check how many tokens is available for him now by calling `getAvailableAmountAggregated()`    
    - This method will give result amount aggregated from all registered `vestingIds` that beneficiary have
    - After each unlocks interval, % of the total amount of tokens will be available for each allocation, and the beneficiary will be able to withdraw. 
    - `Beneficiary` can check how much funds are available for withdrawing by calling `"getAvailableAmountAggregated(address user)"` 
    - To get available on specific `vestingId` beneficiary can call `getAvailableAmount(address user, uint256 vestingId)`. 
    - To withdraw released funds beneficiary needs to call `withdrawAllAvailable()` 
    - To know how many different wares ever open to `beneficiary` anyone can call `getNextVestingId(address user)`.
    - Any un-allocated tokens can be withdrawn *by* the smart contract *owner*.
    - `getUnallocatedFundsAmount()`
    - `withdrawUnallocatedFunds()`


### TEST CONTRACT

## REQUIREMENTS
- Truffle
- GANACHE 

## STEPS TO RUN TEST CASES
 
 - Change the ganache port from truffle-config.js
 - run

```shell
ganache
npm i
npx  truffle test
```
# chainlink-doc
https://docs.chain.link/vrf/v1/supported-networks


# KLINK SMART CONTRACTS

### Deployment Needs
- RNG Contract 

### RNG CONTRACT ACTORS

## OWNER
- The owner can add file hash and ipfs url.
- The owner is able to withdraw link tokens .

