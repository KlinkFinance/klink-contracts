# APY and Lock Duration Configuration

## APY Calculation

The formula for calculating the APY is:

```
APY = ((Targeted APY Rate * No. of Days in Staking Pool) / 365) * 100
```

### Example:

- **Targeted APY Rate:** 15%
- **Number of Days in Staking Pool:** 30 days

Calculation:
```
APY = ((15 * 30) / 365) = 1.2328
APY = 1.2328 * 100 = 123
```

**Note:** APY should be configured at the contract side as an integer value, without decimals.

---

## Lock Duration

The **Lock Duration** is derived from the number of days in the staking pool. To configure it at the contract side, the number of days in the staking pool needs to be multiplied by 24 (hours).

### Formula:
```
Lock Duration = No. of Days in Staking Pool * 24
```

### Example:

- **Number of Days in Staking Pool:** 30 days

Calculation:
```
Lock Duration = 30 * 24 = 720
```

**Result:** Lock Duration = 720 (to be configured at the contract side as hours).

---

### Notes:
- APY should not be in decimal form when configured in the contract.
- Ensure that all configurations are performed as per the provided examples.

### Specific Configuration

- `100% targeted APY` for all contracts
- Calculating hours, expressed in days (contract is not supporting less than days and solidity does not support decimals):
  - 1h = (1 day /24 hours) = 0.04166666667
  - 6h = (1 day /24 hours) \* 6 = 0.25
  - etc...

Use hours instead of days for testing purposes:

- 30 days becomes 1h:
  - `rate` = 1 = (100 _ ( (1/24) _ 1) / 365) \* 100 (should have been `1.1415525114` if decimals were managed correctly in the contract)
  - `lockDuration` = 1
- 90 days becomes 3h:
  - `rate` = 3 (should have been `3.4246575342` if decimals were managed correctly in the contract)
  - `lockDuration` = 3
- 180 days becomes 6h:
  - `rate` = 7 (should have been `6.8493150685` if decimals were managed correctly in the contract)
  - `lockDuration` = 6
- 270 days becomes 9h:
  - `rate` = 10 (should have been `10.2739726027` if decimals were managed correctly in the contract)
  - `lockDuration` = 9