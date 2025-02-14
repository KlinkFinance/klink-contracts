# APY and Lock Duration Configuration

## Overview

This repository contains the APY calculation and lock duration configuration logic for the staking contract. The configurations ensure that APY and lock durations are handled correctly within the smart contract constraints.

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

**Note:** APY should be configured in the contract as an integer value without decimals.

## Lock Duration

The **Lock Duration** is derived from the number of days in the staking pool. The contract requires the lock duration to be specified in hours.

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

**Result:** Lock Duration = 720 hours (to be configured in the contract).

## Specific Configuration

- **100% targeted APY** for all contracts.
- **Hours-based testing setup:** Since Solidity does not support decimals and contracts do not support less than days for lock duration, hours are used for testing.

| Staking Duration | Equivalent Hours | APY Rate (Integer) | Lock Duration (Hours) |
| ---------------- | ---------------- | ------------------ | --------------------- |
| 30 days          | 1h               | 1                  | 1                     |
| 90 days          | 3h               | 3                  | 3                     |
| 180 days         | 6h               | 7                  | 6                     |
| 270 days         | 9h               | 10                 | 9                     |

## Security & Audit

This smart contract has been audited by **CertiK** to ensure security and reliability. You can find the full audit report at:

[CertiK Audit Report](https://skynet.certik.com/projects/klink-finance?auditId=Klink%20Finance#code-security)

## License

This project is licensed under the MIT License.

## Contribution

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a new branch (`feature-branch`).
3. Commit your changes.
4. Push to your branch.
5. Open a pull request.

For any issues or discussions, feel free to open an issue in the repository.

## Contact

For support or inquiries, please reach out via GitHub Issues or contact the development team directly.

