// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.6/contracts/access/Ownable.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.6/contracts/token/ERC20/utils/SafeERC20.sol";

interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

contract IDOLocking is Ownable {
    using SafeERC20 for IERC20;

    struct Deposits {
        uint256 depositAmount;
        uint256 depositTime;
        uint256 endTime;
        uint64 userIndex;
        uint256 rewards;
        bool paid;
    }

    struct Rates {
        uint64 newInterestRate;
        uint256 timeStamp;
    }

    mapping(address => Deposits) private deposits;
    mapping(uint64 => Rates) public rates;
    mapping(address => bool) private hasStaked;

    address public tokenAddress;
    uint8 public tokenDecimals;

    uint256 public stakedBalance;
    uint256 public rewardBalance;
    uint256 public stakedTotal;
    uint256 public totalReward;

    uint64 public index;
    uint64 public rate;
    uint256 public lockDuration; // in seconds
    string public name;
    uint256 public totalParticipants;
    uint256 public cap;
    address public gnosisSafeAddress;

    IERC20 public ERC20Interface;

    event Staked(
        address indexed token,
        address indexed staker_,
        uint256 stakedAmount_
    );

    event PaidOut(
        address indexed token,
        address indexed staker_,
        uint256 amount_,
        uint256 reward_
    );

    /**
     *   @param name_ name of the contract
     *   @param tokenAddress_ contract address of the token
     *   @param rate_ rate multiplied by 100
     *   @param lockDuration_ duration in hours (pass plain hours)
     *   @param cap_ cap in whole tokens (not scaled by decimals)
     *   @param gnosisSafeAddress_ Gnosis Safe address
     */
    constructor(
        string memory name_,
        address tokenAddress_,
        uint64 rate_,
        uint256 lockDuration_,
        uint256 cap_,
        address gnosisSafeAddress_
    ) Ownable() {
        require(tokenAddress_ != address(0), "Zero token address");
        require(rate_ != 0, "Zero interest rate");
        require(cap_ > 0, "Cap must be greater than zero");
        require(gnosisSafeAddress_ != address(0), "Zero Gnosis Safe address");

        name = name_;
        tokenAddress = tokenAddress_;
        ERC20Interface = IERC20(tokenAddress_);
        tokenDecimals = IERC20Decimals(tokenAddress_).decimals();

        cap = cap_ * (10 ** uint256(tokenDecimals));

        // store lock duration in SECONDS
        lockDuration = lockDuration_ * 1 hours;

        rate = rate_;
        rates[index] = Rates(rate, block.timestamp);
        gnosisSafeAddress = gnosisSafeAddress_;
    }

    modifier onlyGnosisSafe() {
        require(msg.sender == gnosisSafeAddress, "Not the Gnosis Safe");
        _;
    }

    function setRateAndLockduration(uint64 rate_, uint256 lockDurationInHours)
        external
        onlyGnosisSafe
    {
        require(rate_ != 0, "Zero interest rate");
        require(lockDurationInHours != 0, "Zero lock duration");

        rate = rate_;
        index++;
        rates[index] = Rates(rate_, block.timestamp);

        // store in seconds
        lockDuration = lockDurationInHours * 1 hours;
    }

    function addReward(uint256 rewardAmount)
        external
        _hasAllowance(msg.sender, rewardAmount)
        returns (bool)
    {
        require(rewardAmount > 0, "Reward must be positive");
        if (!_payMe(msg.sender, rewardAmount)) return false;
        totalReward += rewardAmount;
        rewardBalance += rewardAmount;
        return true;
    }

    function userDeposits(address user)
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            bool
        )
    {
        if (hasStaked[user]) {
            return (
                deposits[user].depositAmount,
                deposits[user].depositTime,
                deposits[user].endTime,
                deposits[user].userIndex,
                deposits[user].paid
            );
        } else {
            return (0, 0, 0, 0, false);
        }
    }

    function stake(uint256 amount)
        external
        _realAddress(msg.sender)
        _hasAllowance(msg.sender, amount)
        returns (bool)
    {
        require(amount > 0, "Can't stake 0 amount");
        require(stakedTotal + amount <= cap, "Staking pool cap reached");
        return _stake(msg.sender, amount);
    }

    function _stake(address from, uint256 amount) private returns (bool) {
        if (!_payMe(from, amount)) return false;

        if (!hasStaked[from]) {
            hasStaked[from] = true;

            deposits[from] = Deposits(
                amount,
                block.timestamp,
                block.timestamp + lockDuration,
                index,
                0,
                false
            );
            totalParticipants++;
        } else {
            require(
                block.timestamp < deposits[from].endTime,
                "Lock expired, withdraw and stake again"
            );

            uint256 newAmount = deposits[from].depositAmount + amount;
            uint256 rewards =
                _calculate(from, block.timestamp) + deposits[from].rewards;

            deposits[from] = Deposits(
                newAmount,
                block.timestamp,
                block.timestamp + lockDuration,
                index,
                rewards,
                false
            );
        }

        emit Staked(tokenAddress, from, amount);
        stakedBalance += amount;
        stakedTotal += amount;

        return true;
    }

    function withdraw() external _realAddress(msg.sender) returns (bool) {
        require(hasStaked[msg.sender], "No stakes found for user");
        require(
            block.timestamp >= deposits[msg.sender].endTime,
            "Requesting before lock time"
        );
        require(!deposits[msg.sender].paid, "Already paid out");
        return _withdraw(msg.sender);
    }

    function _withdraw(address from) private returns (bool) {
        uint256 reward = _calculate(from, deposits[from].endTime) +
            deposits[from].rewards;
        uint256 amount = deposits[from].depositAmount;

        require(reward <= rewardBalance, "Not enough rewards");

        stakedBalance -= amount;
        rewardBalance -= reward;
        deposits[from].paid = true;
        hasStaked[from] = false;
        totalParticipants--;

        if (_payDirect(from, amount + reward)) {
            emit PaidOut(tokenAddress, from, amount, reward);
            return true;
        }
        return false;
    }

    function emergencyWithdraw()
        external
        _realAddress(msg.sender)
        returns (bool)
    {
        require(hasStaked[msg.sender], "No stakes found for user");
        require(
            block.timestamp >= deposits[msg.sender].endTime,
            "Requesting before lock time"
        );
        require(!deposits[msg.sender].paid, "Already paid out");
        return _emergencyWithdraw(msg.sender);
    }

    function _emergencyWithdraw(address from) private returns (bool) {
        uint256 amount = deposits[from].depositAmount;
        stakedBalance -= amount;
        deposits[from].paid = true;
        hasStaked[from] = false;
        totalParticipants--;

        bool principalPaid = _payDirect(from, amount);
        require(principalPaid, "Error paying");
        emit PaidOut(tokenAddress, from, amount, 0);
        return true;
    }

    function calculate(address from) external view returns (uint256) {
        return _calculate(from, deposits[from].endTime);
    }

    function _calculate(address from, uint256 endTime)
        private
        view
        returns (uint256)
    {
        if (!hasStaked[from]) return 0;

        (uint256 amount, uint256 depositTime, uint64 userIndex) = (
            deposits[from].depositAmount,
            deposits[from].depositTime,
            deposits[from].userIndex
        );

        uint256 time;
        uint256 interest;
        uint256 _lockduration = deposits[from].endTime - depositTime;

        for (uint64 i = userIndex; i < index; i++) {
            if (endTime < rates[i + 1].timeStamp) {
                break;
            } else {
                time = rates[i + 1].timeStamp - depositTime;
                interest =
                    (amount * (rates[i].newInterestRate) * time) /
                    (_lockduration * 10000);
                amount += interest;
                depositTime = rates[i + 1].timeStamp;
                userIndex++;
            }
        }

        if (depositTime < endTime) {
            time = endTime - depositTime;
            interest =
                (time * amount * rates[userIndex].newInterestRate) /
                (_lockduration * 10000);
        }

        return interest;
    }

    function _payMe(address payer, uint256 amount) private returns (bool) {
        return _payTo(payer, address(this), amount);
    }

    function _payTo(
        address allower,
        address receiver,
        uint256 amount
    ) private _hasAllowance(allower, amount) returns (bool) {
        ERC20Interface = IERC20(tokenAddress);
        ERC20Interface.safeTransferFrom(allower, receiver, amount);
        return true;
    }

    function _payDirect(address to, uint256 amount) private returns (bool) {
        ERC20Interface = IERC20(tokenAddress);
        ERC20Interface.safeTransfer(to, amount);
        return true;
    }

    modifier _realAddress(address addr) {
        require(addr != address(0), "Zero address");
        _;
    }

    modifier _hasAllowance(address allower, uint256 amount) {
        ERC20Interface = IERC20(tokenAddress);
        uint256 ourAllowance =
            ERC20Interface.allowance(allower, address(this));
        require(amount <= ourAllowance, "Not enough allowance");
        _;
    }
}
