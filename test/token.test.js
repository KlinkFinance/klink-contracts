const assert = require('assert');
const w3 = require('web3');
const { toWei, fromWei } = w3.utils;
const Token = artifacts.require('./Token');

contract('Token Contract', ([owner, user1, user2, user3, user4]) => {
  let instance;
  let MINTER_ROLE;
  let BURNER_ROLE;
  const black_hole = '0x0000000000000000000000000000000000000000';
  const supply = 10000000;
  const maxSupply = 100000000;

  beforeEach(async () => {
    const args = ['Skip Token', 'SKIP', supply, maxSupply, owner];
    instance = await Token.new(...args, { from: owner });
    MINTER_ROLE = await instance.MINTER_ROLE.call();
    BURNER_ROLE = await instance.BURNER_ROLE.call();
  });

  describe('deployment', async () => {
    it('deploys successfully', async () => {
      const address = await instance.address;
      assert(address !== 0x0);
      assert(address !== '');
      assert(address !== null);
      assert(address !== undefined);
    });

    it('has name', async () => {
      const name = await instance.name();
      assert(name === 'Skip Token');
    });

    it('has symbol', async () => {
      const symbol = await instance.symbol();
      assert(symbol === 'SKIP');
    });

    it('total supply', async () => {
      const decimals = await instance.decimals();
      const totalSupply = await instance.totalSupply();
      const expectedSupply = supply * 10 ** decimals;
      assert(+totalSupply === expectedSupply);
    });
  });

  describe('transfer and balance', async () => {
    it('balanceOf user with no tokens ', async function () {
      const balance = await instance.balanceOf(user1);
      assert(+balance === 0);
    });

    it('balanceOf user after transfer', async function () {
      const balance_before = await instance.balanceOf(user2);
      assert(+balance_before === 0);
      const success = await instance.transfer(user2, 100, { from: owner });
      assert(success);
      const balance_after = await instance.balanceOf(user2);
      assert(+balance_after === 100);
    });

    it('transfer', async function () {
      const sender = user3;
      const receiver = user1;

      assert(await instance.transfer(sender, 1000, { from: owner }));

      const balance_before = await instance.balanceOf(sender);
      assert(+balance_before === 1000);

      const success = await instance.transfer(receiver, 100, { from: sender });
      assert(success);

      const balance_after = await instance.balanceOf(receiver);
      assert(+balance_after === 100);
    });

    it('error transferring to black hole', async function () {
      await assert.rejects(
        () => {
          return instance.transfer(black_hole, 100, { from: owner });
        },
        { reason: 'ERC20: transfer to the zero address' }
      );
    });

    it('error transferring amount above balance', async function () {
      const sender = user3;
      const receiver = user1;

      assert(await instance.transfer(sender, 100, { from: owner }));

      await assert.rejects(
        () => {
          return instance.transfer(receiver, 200, { from: sender });
        },
        { reason: 'ERC20: transfer amount exceeds balance' }
      );
    });
  });

  describe('approval', async () => {
    it('successfull approval', async function () {
      const sender = user3;
      const spender = user4;
      const receiver = user1;

      assert(await instance.transfer(sender, 1000, { from: owner }));
      const balance_before = await instance.balanceOf(sender);
      assert(+balance_before === 1000);

      assert(await instance.approve(spender, 400, { from: sender }));

      const allowance = await instance.allowance(sender, spender);
      console.log('allowance ' + allowance);
      assert(+allowance === 400);

      assert(
        await instance.transferFrom(sender, receiver, 400, { from: spender })
      );

      const balance_after = await instance.balanceOf(sender);
      assert(+balance_after === 600);

      const balance_receiver = await instance.balanceOf(receiver);
      assert(+balance_receiver === 400);
    });

    it('decrease approval allowance', async function () {
      const sender = user3;
      const spender = user4;
      const receiver = user1;

      assert(await instance.transfer(sender, 1000, { from: owner }));
      const balance_before = await instance.balanceOf(sender);
      assert(+balance_before === 1000);

      assert(await instance.approve(spender, 400, { from: sender }));

      const allowance = await instance.allowance(sender, spender);
      assert(+allowance === 400);

      assert(await instance.decreaseAllowance(spender, 50, { from: sender }));

      const new_allowance = await instance.allowance(sender, spender);
      assert(+new_allowance === 350);

      assert(
        await instance.transferFrom(sender, receiver, 350, { from: spender })
      );

      const balance_after = await instance.balanceOf(sender);
      assert(+balance_after === 650);

      const balance_receiver = await instance.balanceOf(receiver);
      assert(+balance_receiver === 350);
    });

    it('increase approval allowance', async function () {
      const sender = user3;
      const spender = user4;
      const receiver = user1;

      assert(await instance.transfer(sender, 1000, { from: owner }));
      const balance_before = await instance.balanceOf(sender);
      assert(+balance_before === 1000);

      assert(await instance.approve(spender, 400, { from: sender }));

      const allowance = await instance.allowance(sender, spender);
      assert(+allowance === 400);

      assert(await instance.increaseAllowance(spender, 50, { from: sender }));

      const new_allowance = await instance.allowance(sender, spender);
      assert(+new_allowance === 450);

      assert(
        await instance.transferFrom(sender, receiver, 450, { from: spender })
      );

      const balance_after = await instance.balanceOf(sender);
      assert(+balance_after === 550);

      const balance_receiver = await instance.balanceOf(receiver);
      assert(+balance_receiver === 450);
    });

    it('decrease allowance below 0', async function () {
      const sender = user3;
      const spender = user4;

      assert(await instance.transfer(sender, 1000, { from: owner }));
      const balance_before = await instance.balanceOf(sender);
      assert(+balance_before === 1000);

      assert(await instance.approve(spender, 400, { from: sender }));

      const allowance = await instance.allowance(sender, spender);
      assert(+allowance === 400);

      await assert.rejects(
        () => {
          return instance.decreaseAllowance(spender, 500, { from: sender });
        },
        { reason: 'ERC20: decreased allowance below zero' }
      );
    });

    it('error if amount > allowance', async () => {
      const sender = user3;
      const spender = user4;
      const receiver = user1;

      assert(await instance.transfer(sender, 1000, { from: owner }));
      const balance_before = await instance.balanceOf(sender);
      assert(+balance_before === 1000);

      assert(await instance.approve(spender, 400, { from: sender }));

      const allowance = await instance.allowance(sender, spender);
      console.log('allowance ' + allowance);
      assert(+allowance === 400);

      await assert.rejects(
        () => {
          return instance.transferFrom(sender, receiver, 500, {
            from: spender,
          });
        },
        { reason: 'ERC20: transfer amount exceeds allowance' }
      );
    });

    it('error if amount > balance', async () => {
      const sender = user3;
      const spender = user4;
      const receiver = user1;

      assert(await instance.transfer(sender, 1000, { from: owner }));
      const balance_before = await instance.balanceOf(sender);
      assert(+balance_before === 1000);

      assert(await instance.approve(spender, 1100, { from: sender }));

      const allowance = await instance.allowance(sender, spender);
      console.log('allowance ' + allowance);
      assert(+allowance === 1100);

      await assert.rejects(
        () => {
          return instance.transferFrom(sender, receiver, 1100, {
            from: spender,
          });
        },
        { reason: 'ERC20: transfer amount exceeds balance' }
      );
    });

    it('error if spender is black hole', async () => {
      const sender = user3;
      const spender = black_hole;

      await assert.rejects(
        () => {
          return instance.approve(spender, 1100, { from: sender });
        },
        { reason: 'ERC20: approve to the zero address' }
      );
    });
  });

  describe('Add Minter  and burner role to user ', async () => {
    it('Allows to add MINTER ROLE and mint new tokens', async function () {
      await instance.grantRole(MINTER_ROLE, user1, {
        from: owner,
      });
      // mint 1000 new tokens
      await instance.mint(user1, toWei('1000', 'ether'), { from: user1 });

      const estimatedSupply = supply + 1000;
      const newSupply = await instance.totalSupply();
      assert(+fromWei(newSupply) === estimatedSupply);
    });

    it('Should not Allow MINTER ROLE to mint above max', async function () {
      await instance.grantRole(MINTER_ROLE, user1, {
        from: owner,
      });
      const currentSupply = await instance.totalSupply();
      const amount = currentSupply + 100000000;

      await assert.rejects(
        async () => {
          await instance.mint(user1, toWei(amount, 'ether'), { from: user1 });
        },
        { reason: 'Total Supply can\'t be greater than max supply' }
      );
    });

    it('Allows to add BURNER ROLE and  burn the tokens', async function () {
      await instance.grantRole(BURNER_ROLE, user1, {
        from: owner,
      });

      await instance.transfer(user1, toWei('1000', 'ether'), { from: owner });

      // burn 1000 tokens from user 1
      await instance.burn(user1, toWei('1000', 'ether'), { from: user1 });

      const estimatedSupply = supply - 1000;
      const newSupply = await instance.totalSupply();
      assert(+fromWei(newSupply) === estimatedSupply);
    });

    it('Should not allow to add  Any roles if not admin', async () => {
      await assert.rejects(
        () => {
          return instance.grantRole(MINTER_ROLE, user1, { from: user1 });
        },
        { reason: 'AccessControl: sender must be an admin to grant' }
      );

      await assert.rejects(
        () => {
          return instance.grantRole(BURNER_ROLE, user1, { from: user1 });
        },
        { reason: 'AccessControl: sender must be an admin to grant' }
      );
    });

    it('Should not allow any user to mint and burn tokens', async () => {
      await assert.rejects(
        () => {
          return instance.mint(user1, toWei('1000', 'ether'), { from: user1 });
        },
        { reason: 'Token::caller is not minter' }
      );

      await assert.rejects(
        () => {
          return instance.burn(user1, toWei('1000', 'ether'), { from: user1 });
        },
        { reason: 'Token::caller is not burner' }
      );
    });
  });

  describe('Remove minter and burner access from user  ', async () => {
    it('Allows admin to remove  MINTER ROLE ', async function () {
      await instance.grantRole(MINTER_ROLE, user1, {
        from: owner,
      });

      await instance.revokeRole(MINTER_ROLE, user1, {
        from: owner,
      });

      await assert.rejects(
        () => {
          return instance.mint(user1, toWei('1000', 'ether'), { from: user1 });
        },
        { reason: 'Token::caller is not minter' }
      );
    });

    it('Allows admin to remove  BURNER ROLE ', async function () {
      await instance.grantRole(BURNER_ROLE, user1, {
        from: owner,
      });

      await instance.revokeRole(BURNER_ROLE, user1, {
        from: owner,
      });

      await assert.rejects(
        () => {
          return instance.burn(user1, toWei('1000', 'ether'), { from: user1 });
        },
        { reason: 'Token::caller is not burner' }
      );
    });

    it('Allows admin to remove  BURNER ROLE ', async function () {
      await instance.grantRole(BURNER_ROLE, user1, {
        from: owner,
      });

      await instance.revokeRole(BURNER_ROLE, user1, {
        from: owner,
      });

      await assert.rejects(
        () => {
          return instance.burn(user1, toWei('1000', 'ether'), { from: user1 });
        },
        { reason: 'Token::caller is not burner' }
      );
    });
  });
});
