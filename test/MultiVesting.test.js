const assert = require('assert');
const {
  timeTravel,
  currentBlockTime,
  getTimestamp,
  takeSnapshot,
  revertToSnapShot,
  addDays,
  advanceTime
} = require('./helper/timeHelper');
const w3 = require('web3');
const { toWei, fromWei } = w3.utils;

const MultiVesting = artifacts.require('MultiVesting');
const MockERC20Token = artifacts.require('Token');
const secondsInDay = 86400;
const secondsIn30Days = secondsInDay * 30;

contract('MultiVesting', function ([owner, user1, user2, user3, user4]) {
  describe('Owner & beneficiaries', async function ()   {
    beforeEach('Deploy Token and MultiVesting contracts', async function () {
      const args = ['MockERC20Token', 'TST', 10000000, 100000000, owner];
      this.erc20Token = await MockERC20Token.new(...args, { from: owner });

      this.multiVesting = await MultiVesting.new(this.erc20Token.address, {
        from: owner,
      });

      await this.erc20Token.transfer(
        this.multiVesting.address,
        toWei('100', 'ether'),
        { from: owner }
      );
    });

    it('Allows to add vesting to owner', async function () {
      const args = [user1, toWei('10', 'ether'), toWei('2', 'ether'), 1];
      await this.multiVesting.addVestingFromNow(...args, { from: owner });
      const x = await this.multiVesting.getNextVestingId(user1);
      assert(x.toNumber() === 1);
    });

    it('Allows to add vesting to owner with 0 months', async function () {
      const args = [user1, toWei('10', 'ether'), toWei('2', 'ether'), 0];
      await this.multiVesting.addVestingFromNow(...args, { from: owner });
      const x = await this.multiVesting.getNextVestingId(user1);
      assert(x.toNumber() === 1);
    });

    it("Doesn't allow add vesting to owner with a past timestamp", async function () {
      const timestampInThePast = Math.floor(Date.now() / 1000) - 20000;
      const args = [
        user1,
        toWei('10', 'ether'),
        timestampInThePast,
        toWei('2', 'ether'),
        4,
      ];
      await assert.rejects(
        () => {
          return this.multiVesting.addVesting(...args, { from: owner });
        },
        { reason: 'TIMESTAMP_CANNOT_BE_IN_THE_PAST' }
      );
    });

    it("Doesn't allow add vesting to owner with greater start amount", async function () {
      const timestampInThePast = Math.floor(Date.now() / 1000) - 20000;
      const args = [user1, toWei('10', 'ether'), toWei('15', 'ether'), 4];
      await assert.rejects(
        () => {
          return this.multiVesting.addVestingFromNow(...args, { from: owner });
        },
        { reason: 'START_AMOUNT_CANNOT_BE_GREATER' }
      );
    });

    it("Doesn't allow to other add vesting", async function () {
      await assert.rejects(
        () => {
          const args = [user1, toWei('10', 'ether'), toWei('15', 'ether'), 4];
          return this.multiVesting.addVestingFromNow(...args, { from: user3 });
        },
        { reason: 'Ownable: caller is not the owner' }
      );
    });

    it('Allows to add vesting to multiple beneficiaries', async function () {
      {
        const args = [user1, toWei('10', 'ether'), toWei('2', 'ether'), 4];
        await this.multiVesting.addVestingFromNow(...args, { from: owner });
        const nextVestingId = await this.multiVesting.getNextVestingId(user1);
        assert(nextVestingId.toNumber() === 1);
      }

      {
        const args = [user2, toWei('10', 'ether'), toWei('2', 'ether'), 4];
        await this.multiVesting.addVestingFromNow(...args, { from: owner });
        const nextVestingId = await this.multiVesting.getNextVestingId(user2);
        assert(nextVestingId.toNumber() === 1);
      }
    });

    it('Allows to add several vesting options to the same beneficiary', async function () {
      const args = [user1, toWei('10', 'ether'), toWei('2', 'ether'), 4];
      await this.multiVesting.addVestingFromNow(...args, { from: owner });
      await this.multiVesting.addVestingFromNow(...args, { from: owner });

      const x = await this.multiVesting.getNextVestingId(user1);
      assert(x.toNumber() === 2);
    });

    it("Doesn't allow to add westing if balance is insufficient", async function () {
      await assert.rejects(
        () => {
          const args = [user1, toWei('6000', 'ether'), toWei('2', 'ether'), 4];
          return this.multiVesting.addVestingFromNow(...args, { from: owner });
        },
        { reason: 'DON_T_HAVE_ENOUGH_PMA' }
      );
    });
  });

  describe('Funds unlock tests', async function () {
    beforeEach('Deploy Token and MultiVesting contracts', async function () {
      const args = ['MockERC20Token', 'TST', 10000000, 100000000, owner];
      this.erc20Token = await MockERC20Token.new(...args, { from: owner });

      this.multiVesting = await MultiVesting.new(this.erc20Token.address, {
        from: owner,
      });

      await this.erc20Token.transfer(
        this.multiVesting.address,
        toWei('1000', 'ether'),
        { from: owner }
      );

      {
        const args = [user1, toWei('10', 'ether'), toWei('2', 'ether'), 4];
        await this.multiVesting.addVestingFromNow(...args, { from: owner });
      }
      {
        const args = [user2, toWei('10', 'ether'), toWei('10', 'ether'), 0];
        await this.multiVesting.addVestingFromNow(...args, { from: owner });
      }
      {
        const args = [user3, toWei('10', 'ether'), toWei('1', 'ether'), 0];
        await this.multiVesting.addVestingFromNow(...args, { from: owner });
      }
    });

    it('Allows to withdraw TGE amount with 0 months vesting', async function () {
      // await timeTravel(secondsIn30Days)
      const vestingId = '0';
      await this.multiVesting.withdrawAllAvailable({ from: user2 });
      const balanceBn = await this.erc20Token.balanceOf(user2);
      const balanceInEther = fromWei(balanceBn, 'milli') / 1000;
      assert.strictEqual(balanceInEther, 10); // TGE AMOUNT
    });

    it('Allows to withdraw total amount with 0 months vesting', async function () {
      // await timeTravel(secondsIn30Days)
      const vestingId = '0';
      const availableBalance = await this.multiVesting.getAvailableAmountAggregated(user3);
      const availableBalanceInEther = fromWei(availableBalance, 'milli') / 1000;
      assert.strictEqual(availableBalanceInEther, 10); // TGE AMOUNT
      await this.multiVesting.withdrawAllAvailable({ from: user3 });
      const balanceBn = await this.erc20Token.balanceOf(user3);
      const balanceInEther = fromWei(balanceBn, 'milli') / 1000;
      assert.strictEqual(balanceInEther, 10); // TGE AMOUNT
      await timeTravel(secondsIn30Days);
      await this.multiVesting.withdrawAllAvailable({ from: user1 });
      const newBalanceBn = await this.erc20Token.balanceOf(user3);
      const newBalanceInEther = fromWei(newBalanceBn, 'milli') / 1000;
      assert.strictEqual(newBalanceInEther, 10); // TGE AMOUNT
    });

    it('Allows to withdraw TGE amount', async function () {
      // await timeTravel(secondsIn30Days)
      const vestingId = '0';
      await this.multiVesting.withdrawAllAvailable({ from: user1 });
      const balanceBn = await this.erc20Token.balanceOf(user1);
      const balanceInEther = fromWei(balanceBn, 'milli') / 1000;
      assert.strictEqual(balanceInEther, 2); // TGE AMOUNT
    });

    it('Allows to withdraw part of the funds after 30 days', async function () {
      await timeTravel(secondsIn30Days);

      await this.multiVesting.withdrawAllAvailable({ from: user1 });
      const balanceBn = await this.erc20Token.balanceOf(user1);
      const balanceInEther = fromWei(balanceBn, 'milli') / 1000;
      assert.strictEqual(balanceInEther, 4);
    });

    it('Allows to withdraw part of the funds after 60 days', async function () {
      await timeTravel(secondsIn30Days * 2);
      await this.multiVesting.withdrawAllAvailable({ from: user1 });
      const balanceBn = await this.erc20Token.balanceOf(user1);
      const balanceInEther = fromWei(balanceBn, 'milli') / 1000;
      assert.strictEqual(balanceInEther, 6); // 8%
    });

    it('Allows to withdraw all the vested funds after 30*4 days', async function () {
      await timeTravel(secondsIn30Days * 4);
      await this.multiVesting.withdrawAllAvailable({ from: user1 });
      const balanceBn = await this.erc20Token.balanceOf(user1);
      const balanceInEther = fromWei(balanceBn, 'milli') / 1000;
      assert.strictEqual(balanceInEther, 10); // 100%
    });

    it('Call of withdraw transfers correct amount of funds after 30*30 month', async function () {
      await timeTravel(secondsIn30Days * 30);
      await this.multiVesting.withdrawAllAvailable({ from: user1 });
      const balanceBn = await this.erc20Token.balanceOf(user1);
      const balanceInEther = fromWei(balanceBn, 'milli') / 1000;
      assert.strictEqual(balanceInEther, 10); // 100% and no more
    });

    it("Returns 0 for allocation available for the beneficiaries who doesn't have vesting", async function () {
      const balanceBn = await this.multiVesting.getAvailableAmountAggregated(
        user4,
        { from: user4 }
      );
      const balanceInEther = fromWei(balanceBn, 'milli') / 1000;
      assert.strictEqual(balanceInEther, 0); // 100% and no more
    });

    it("Returns 0 for allocation available for the beneficiaries who doesn't have vesting, when vesingId is specified explicitly", async function () {
      const balanceBn = await this.multiVesting.getAvailableAmount(user4, '0', {
        from: user4,
      });
      const balanceInEther = fromWei(balanceBn, 'milli') / 1000;
      assert.strictEqual(balanceInEther, 0); // 100% and no more
    });
  });

  describe('Withdraw', async function () {
    beforeEach('Deploy Token and MultiVesting contracts', async function () {
      const args = ['MockERC20Token', 'TST', 10000000, 100000000, owner];
      this.erc20Token = await MockERC20Token.new(...args, { from: owner });

      this.multiVesting = await MultiVesting.new(this.erc20Token.address, {
        from: owner,
      });

      await this.erc20Token.transfer(
        this.multiVesting.address,
        toWei('1', 'ether'),
        { from: owner }
      );

      // 0.3 ether to user1
      {
        const args = [user1, toWei('0.3', 'ether'), toWei('0', 'ether'), 4];
        await this.multiVesting.addVestingFromNow(...args, { from: owner });
      }

      // 0.3 ether to user2
      {
        const args = [user2, toWei('0.3', 'ether'), toWei('0', 'ether'), 4];
        await this.multiVesting.addVestingFromNow(...args, { from: owner });
      }

      // 0.3 ether to user3
      {
        const args = [user3, toWei('0.3', 'ether'), toWei('0', 'ether'), 4];
        await this.multiVesting.addVestingFromNow(...args, { from: owner });
      }
    });

    it('Allows withdraw unallocated funds to owner', async function () {
      {
        const balanceBn = await this.erc20Token.balanceOf(user4);
        const balanceInEther = fromWei(balanceBn, 'milli') / 1000;
        assert.strictEqual(balanceInEther, 0, 'Initial balance is 0');
      }

      await this.multiVesting.withdrawUnallocatedFunds(user4, { from: owner });
      const balanceBn = await this.erc20Token.balanceOf(user4);
      const balanceInEther = fromWei(balanceBn, 'milli') / 1000;
      assert.strictEqual(
        balanceInEther,
        0.1,
        'Expect to withdraw 0.1 of unallocated funds'
      );
    });

    it("Doesn't allow withdraw unallocated funds to anyone else", async function () {
      await assert.rejects(
        this.multiVesting.withdrawUnallocatedFunds(user4, { from: user4 }),
        { reason: 'Ownable: caller is not the owner' }
      );
    });

    it("Doesn't allow to withdraw in case all funds are allocated", async function () {
      // Allocate 0.1 more to user3, so all funds are distributed
      const args = [user3, toWei('0.1', 'ether'), toWei('0', 'ether'), 4];
      await this.multiVesting.addVestingFromNow(...args, { from: owner });

      await assert.rejects(
        this.multiVesting.withdrawUnallocatedFunds(user4, { from: owner }),
        { reason: 'DON_T_HAVE_UNALLOCATED_TOKENS' }
      );
    });
  });

  describe('Test function that iterate over vesting Ids', async function () {
    beforeEach('Deploy Token and MultiVesting contracts', async function () {
      const args = ['MockERC20Token', 'TST', 10000000, 100000000, owner];
      this.erc20Token = await MockERC20Token.new(...args, { from: owner });

      this.multiVesting = await MultiVesting.new(this.erc20Token.address, {
        from: owner,
      });

      await this.erc20Token.transfer(
        this.multiVesting.address,
        toWei('1', 'ether'),
        { from: owner }
      );

      const vestingArgs = [
        user1,
        toWei('0.3', 'ether'),
        toWei('0', 'ether'),
        4,
      ];
      await this.multiVesting.addVestingFromNow(...vestingArgs, {
        from: owner,
      });
      await this.multiVesting.addVestingFromNow(...vestingArgs, {
        from: owner,
      });
      await this.multiVesting.addVestingFromNow(...vestingArgs, {
        from: owner,
      });
    });

    it('Returns the vesting map', async function () {
      const history = await this.multiVesting.getVestingHistory.call({ from: owner});
      assert.equal(history.length, 3);
      assert.equal(history[0][0], user1);
      assert.equal(history[1][0], user1);
      assert.equal(history[2][0], user1);
    });


    it('Returns correct aggregated available amount for beneficiary with several allocations', async function () {
      await timeTravel(secondsIn30Days * 4);
      const total = await this.multiVesting.getAvailableAmountAggregated(
        user1,
        { from: user1 }
      );
      const balanceInEther = fromWei(total, 'milli') / 1000;

      assert.strictEqual(balanceInEther, 0.9);
    });

    //     // Test were add to have full coverage
    it('Returns correct aggregated available amount for beneficiary with several allocations.\nAnd one of allocations was withdraw fully before the last completed', async function () {
      await timeTravel(secondsIn30Days * 4);
      {
        const total = await this.multiVesting.getAvailableAmountAggregated(
          user1,
          { from: user1 }
        );
        const balanceInEther = fromWei(total, 'milli') / 1000;
        assert.strictEqual(balanceInEther, 0.9);
      }

      await this.multiVesting.withdrawAllAvailable({ from: user1 });

      {
        const vestingArgs = [
          user1,
          toWei('0.1', 'ether'),
          toWei('0', 'ether'),
          4,
        ];
        await this.multiVesting.addVestingFromNow(...vestingArgs, {
          from: owner,
        });

        await timeTravel(secondsIn30Days * 4);

        const total = await this.multiVesting.getAvailableAmountAggregated(
          user1,
          { from: user1 }
        );
        const balanceInEther = fromWei(total, 'milli') / 1000;
        assert.strictEqual(balanceInEther, 0.1);
      }
    });

    it("Returns 0 for beneficiary that doesn't have allocations", async function () {
      await timeTravel(secondsIn30Days * 4);
      const total = await this.multiVesting.getAvailableAmountAggregated(
        user2,
        { from: user2 }
      );
      assert.strictEqual(total.toNumber(), 0);
    });

    it('Allows to withdraw all funds from several when vesting time is expired', async function () {
      await timeTravel(secondsIn30Days * 4);

      await this.multiVesting.withdrawAllAvailable({ from: user1 });
      const balanceBn = await this.erc20Token.balanceOf(user1);
      const balanceInEther = fromWei(balanceBn, 'milli') / 1000;

      assert.strictEqual(balanceInEther, 0.9);
    });
  });

  // consider 1 month =30 days fix
  describe('Funds unlock test with cliff', async function () {
    beforeEach('Deploy Token and MultiVesting contracts', async function () {
        const args = ['MockERC20Token', 'TST', 10000000, 100000000, owner];
      this.erc20Token = await MockERC20Token.new(...args, { from: owner });

      this.multiVesting = await MultiVesting.new(this.erc20Token.address, {
        from: owner,
      });

      await this.erc20Token.transfer(
        this.multiVesting.address,
        toWei('1000', 'ether'),
        { from: owner }
      );

      {
        const currentTimestamp = await currentBlockTime();
        const timestamp = await getTimestamp(currentTimestamp, 1);
        const args = [user1, toWei('10', 'ether'), timestamp, 0, 4];
        await this.multiVesting.addVesting(...args, { from: owner });
      }
    });

    it('Returns 0 from current timestamp', async function () {
      const balanceBn = await this.multiVesting.getAvailableAmount(user1, '0', {
        from: user1,
      });
      const balanceInEther = fromWei(balanceBn, 'milli') / 1000;
      assert.strictEqual(balanceInEther, 0); // 100% and no more
    });

    // 2.5 is passed becuase as per contract 30 days is vesting cycle
    it('Returns initial amount  after 3 months', async function () {
      await timeTravel(secondsIn30Days * 2.5);
      const balanceBn = await this.multiVesting.getAvailableAmount(user1, '0', {
        from: user1,
      });
      const balanceInEther = fromWei(balanceBn, 'milli') / 1000;

      assert.strictEqual(balanceInEther, 2.5); // 100% and no more
      await timeTravel(0);
    });

    it('Allows to withdraw  amount for 2nd month', async function () {
      await timeTravel(secondsIn30Days * 2.5);
      await this.multiVesting.withdrawAllAvailable({ from: user1 });
      const balanceBn = await this.erc20Token.balanceOf(user1);
      const balanceInEther = fromWei(balanceBn, 'milli') / 1000;
      assert.strictEqual(balanceInEther, 2.5); // TGE AMOUNT
    });

    it('WithDraw All tokens after vesting cycle', async function () {
      await timeTravel(secondsIn30Days * 6);
      await this.multiVesting.withdrawAllAvailable({ from: user1 });
      const balanceBn = await this.erc20Token.balanceOf(user1);
      const balanceInEther = fromWei(balanceBn, 'milli') / 1000;
      assert.strictEqual(balanceInEther, 10); // TGE AMOUNT
    });
  });

  // consider 1 month =30 days fix
  describe('Funds unlock test with cliff and 0 months', async function () {
    beforeEach('Deploy Token and MultiVesting contracts', async function () {
      const args = ['MockERC20Token', 'TST', 10000000, 100000000, owner];
      this.erc20Token = await MockERC20Token.new(...args, { from: owner });

      this.multiVesting = await MultiVesting.new(this.erc20Token.address, {
        from: owner,
      });

      await this.erc20Token.transfer(
        this.multiVesting.address,
        toWei('1000', 'ether'),
        { from: owner }
      );

      const snapShot = await takeSnapshot();

      snapshotId = snapShot['result'];

      {
        const currentTimestamp = await currentBlockTime();
        const timestamp = await addDays(currentTimestamp, 10);
        const args = [user1, toWei('10', 'ether'), timestamp, 0, 0];
        await this.multiVesting.addVesting(...args, { from: owner });
      }
      {
        const currentTimestamp = await currentBlockTime();
        const timestamp = await addDays(currentTimestamp, 15);
        const args = [user2, toWei('11', 'ether'), timestamp, toWei('5', 'ether'), 0];
        await this.multiVesting.addVesting(...args, { from: owner });
      }
    });

    afterEach(async() => {
      await revertToSnapShot(snapshotId);
  });
  

    it('Returns 0 after 1d for 10d cliff', async function () {
      await timeTravel(secondsInDay);
      const balanceBn = await this.multiVesting.getAvailableAmount(user1, '0', {
        from: user1,
      });
      const balanceInEther = fromWei(balanceBn, 'milli') / 1000;
      assert.strictEqual(balanceInEther, 0); // 100% and no more
    });

    it('Returns 0 after 1d for 15d cliff', async function () {
      const balanceBn = await this.multiVesting.getAvailableAmount(user2, '0', {
        from: user2,
      });
      const balanceInEther = fromWei(balanceBn, 'milli') / 1000;
      assert.strictEqual(balanceInEther, 0); // 100% and no more
    });

    it('Returns total amount after 10d for 10d cliff', async function () {
      await timeTravel(secondsInDay * 10);
      const balanceBn = await this.multiVesting.getAvailableAmount(user1, '0', {
        from: user1,
      });
      const balanceInEther = fromWei(balanceBn, 'milli') / 1000;
      assert.strictEqual(balanceInEther, 10); // 100% and no more
    });

    it('Returns total amount after 10d for 15d cliff', async function () {
      const balanceBn = await this.multiVesting.getAvailableAmount(user2, '0', {
        from: user2,
      });
      const balanceInEther = fromWei(balanceBn, 'milli') / 1000;
      assert.strictEqual(balanceInEther, 0); // 100% and no more
    });

    it('Returns total amount after 15d for 15d cliff', async function () {
      await timeTravel(secondsInDay * 15);
      const balanceBn = await this.multiVesting.getAvailableAmount(user2, '0', {
        from: user2,
      });
      const balanceInEther = fromWei(balanceBn, 'milli') / 1000;
      assert.strictEqual(balanceInEther, 11); // 100% and no more
    });
  });
});
