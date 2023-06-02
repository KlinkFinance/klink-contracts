# klink-contracts
This repo is for klink smart contracts

# chainlink-doc
https://docs.chain.link/vrf/v1/supported-networks


# KLINK SMART CONTRACTS

### INTRODUCTION

The Klink Smart contracts has a RNG smart contract using chainlink .
### Constants
- Unlock interval 30 days

### Deployment Needs
- RNG Contract 

### RNG CONTRACT ACTORS

## OWNER
- The owner can add file hash and ipfs url.
- The owner is able to withdraw link tokens .


### How to use

- The smart contract should be topped up with LINK tokens, which is a simple token transfer to the smart contract by any wallet address.
- The owner of the smart contract will then be able to allocate tokens to any of the beneficiaries, with the restriction that the allocation should be limited to the amount of tokens held by the smart contract.
    


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



