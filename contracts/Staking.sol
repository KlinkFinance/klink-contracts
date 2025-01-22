// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SafeERC20, IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
contract IDOLocking is Ownable {
    using SafeERC20 for IERC20;
    /**
     *  @dev Structs to store user staking data.
     */
    struct Deposits {
        uint256 depositAmount;
        uint256 depositTime;
        uint256 endTime;
        uint64 userIndex;
        bool paid;
    }
    /**
     *  @dev Structs to store interest rate change.
     */
    struct Rates {
        uint64 newInterestRate;
        uint256 timeStamp;
    }
    mapping(address => Deposits) private deposits;
    mapping(uint64 => Rates) public rates;
    mapping(address => bool) private hasStaked;
    address public tokenAddress;
    uint256 public stakedBalance;
    uint256 public rewardBalance;
    uint256 public stakedTotal;
    uint256 public totalReward;
    uint64 public index;
    uint64 public rate;
    uint256 public lockDuration;
    string public name;
    uint256 public totalParticipants;
    uint256 public cap;
    address public gnosisSafeAddress;  // Gnosis Safe address

    IERC20 public ERC20Interface;
    /**
     *  @dev Emitted when user stakes 'stakedAmount' value of tokens
     */
    event Staked(
        address indexed token,
        address indexed staker_,
        uint256 stakedAmount_
    );
    /**
     *  @dev Emitted when user withdraws his stakings
     */
    event PaidOut(
        address indexed token,
        address indexed staker_,
        uint256 amount_,
        uint256 reward_
    );
    /**
     *   @param
     *   name_ name of the contract
     *   tokenAddress_ contract address of the token
     *   rate_ rate multiplied by 100
     *   lockduration_ duration in days
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
        require(gnosisSafeAddress_ != address(0), "Zero Gnosis Safe address"); // Ensure it's not a zero address

        name = name_;
        tokenAddress = tokenAddress_;
        lockDuration = lockDuration_;
        rate = rate_;
        rates[index] = Rates(rate, block.timestamp);
        cap = cap_;
        gnosisSafeAddress = gnosisSafeAddress_; // Store Gnosis Safe address
    }

     // Modifier to ensure that only Gnosis Safe can call
    modifier onlyGnosisSafe() {
        require(msg.sender == gnosisSafeAddress, "Not the Gnosis Safe");
        _;
    }

    /**
     *  Requirements:
     *  `rate_` New effective interest rate multiplied by 100
     *  @dev to set interest rates
     *  `lockduration_' lock days
     *  @dev to set lock duration days
     */
   function setRateAndLockduration(uint64 rate_, uint256 lockduration_)
        external
        onlyGnosisSafe  // Only Gnosis Safe can call this
    {
        require(rate_ != 0, "Zero interest rate");
        require(lockduration_ != 0, "Zero lock duration");
        rate = rate_;
        index++;
        rates[index] = Rates(rate_, block.timestamp);
        lockDuration = lockduration_;
    }

    /**
     *  Requirements:
     *  `rewardAmount` rewards to be added to the staking contract
     *  @dev to add rewards to the staking contract
     *  once the allowance is given to this contract for 'rewardAmount' by the user
     */
    function addReward(uint256 rewardAmount)
        external
        _hasAllowance(msg.sender, rewardAmount)
        returns (bool)
    {
        require(rewardAmount > 0, "Reward must be positive");
        if (!_payMe(msg.sender, rewardAmount)) {
            return false;
        }
        totalReward = totalReward + rewardAmount;
        rewardBalance = rewardBalance + rewardAmount;
        return true;
    }
    /**
     *  Requirements:
     *  `user` User wallet address
     *  @dev returns user staking data
     */
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
        }else // Return default values if user has not staked
        return (0, 0, 0, 0, false);
    }
    /**
     *  Requirements:
     *  `amount` Amount to be staked
     /**
     *  @dev to stake 'amount' value of tokens 
     *  once the user has given allowance to the staking contract
     */
    function stake(uint256 amount)
        external
        _realAddress(msg.sender)
        _hasAllowance(msg.sender, amount)
        returns (bool)
    {
        require(amount > 0, "Can't stake 0 amount");
        require(!hasStaked[msg.sender], "Already Staked");
        require(
            stakedTotal + amount <= cap,
            "Staking pool cap reached"
        );
        return (_stake(msg.sender, amount));
    }
    function _stake(address from, uint256 amount) private returns (bool) {
        if (!_payMe(from, amount)) {
            return false;
        }
        hasStaked[from] = true;
        deposits[from] = Deposits(
            amount,
            block.timestamp,
            block.timestamp + (lockDuration * 3600), //lockDuration * 24 * 3600
            index,
            false
        );
        emit Staked(tokenAddress, from, amount);
        stakedBalance = stakedBalance + amount;
        stakedTotal = stakedTotal+amount;
        totalParticipants = totalParticipants+1;
        return true;
    }
    /**
     * @dev to withdraw user stakings after the lock period ends.
     */
    function withdraw() external _realAddress(msg.sender) returns (bool) {
        require(hasStaked[msg.sender], "No stakes found for user");
        require(
            block.timestamp >= deposits[msg.sender].endTime,
            "Requesting before lock time"
        );
        require(!deposits[msg.sender].paid, "Already paid out");
        return (_withdraw(msg.sender));
    }
    function _withdraw(address from) private returns (bool) {
        uint256 payOut = _calculate(from);
        uint256 amount = deposits[from].depositAmount;
        uint256 reward = payOut-amount;
        require(reward <= rewardBalance, "Not enough rewards");
        stakedBalance = stakedBalance - amount;
        rewardBalance = rewardBalance- reward;
        deposits[from].paid = true;
        hasStaked[from] = false;
        totalParticipants = totalParticipants-1;
        if (_payDirect(from, payOut)) {
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
        return (_emergencyWithdraw(msg.sender));
    }
    function _emergencyWithdraw(address from) private returns (bool) {
        uint256 amount = deposits[from].depositAmount;
        stakedBalance = stakedBalance-amount;
        deposits[from].paid = true;
        hasStaked[from] = false; //Check-Effects-Interactions pattern
        totalParticipants = totalParticipants-1;
        bool principalPaid = _payDirect(from, amount);
        require(principalPaid, "Error paying");
        emit PaidOut(tokenAddress, from, amount, 0);
        return true;
    }
    /**
     *  Requirements:
     *  `from` User wallet address
     * @dev to calculate the rewards based on user staked 'amount'
     * 'userIndex' - the index of the interest rate at the time of user stake.
     * 'depositTime' - time of staking
     */
    function calculate(address from) external view returns (uint256) {
        return _calculate(from);
    }
    function _calculate(address from) private view returns (uint256) {
        if (!hasStaked[from]) return 0;
        (
            uint256 amount,
            uint256 depositTime,
            uint256 endTime,
            uint64 userIndex
        ) = (
                deposits[from].depositAmount,
                deposits[from].depositTime,
                deposits[from].endTime,
                deposits[from].userIndex
            );
        uint256 time;
        uint256 interest;
        uint256 _lockduration = endTime-depositTime;
        for (uint64 i = userIndex; i < index; i++) {
            //loop runs till the latest index/interest rate change
            if (endTime < rates[i + 1].timeStamp) {
                //if the change occurs after the endTime loop breaks
                break;
            } else {
                time = rates[i + 1].timeStamp- depositTime;
                interest = (amount * rates[i].newInterestRate * time) / (_lockduration * 10000); //replace with (_lockduration * 10000)
                amount += interest;
                depositTime = rates[i + 1].timeStamp;
                userIndex++;
            }
        }
        if (depositTime < endTime) {
            //final calculation for the remaining time period
            time = endTime - depositTime;
            interest = (time * amount * rates[userIndex].newInterestRate) / (_lockduration * 10000); //replace with (lockduration * 10000)
            amount += interest;
        }
        return (amount);
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
        // Make sure the allower has provided the right allowance.
        ERC20Interface = IERC20(tokenAddress);
        uint256 ourAllowance = ERC20Interface.allowance(allower, address(this));
        require(amount <= ourAllowance, "Make sure to add enough allowance");
        _;
    }
}