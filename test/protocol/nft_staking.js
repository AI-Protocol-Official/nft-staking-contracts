// AI Protocol NFTStaking: AI Personality Staking tests

// Zeppelin test helpers
const {
	BN,
	balance,
	constants,
	expectEvent,
	expectRevert,
} = require("@openzeppelin/test-helpers");
const {
	ZERO_ADDRESS,
	ZERO_BYTES32,
	MAX_UINT256,
} = constants;

// Chai test helpers
const {
	assert,
	expect,
} = require("chai");

// helper functions in use
const {
	expectEventInTransaction,
} = require("../include/helper");

// BN utils
const {
	random_bn,
} = require("../include/bn_utils");

// ACL features and roles
const {
	not,
	FEATURE_STAKING,
	FEATURE_UNSTAKING,
	ROLE_RESCUE_MANAGER,
} = require("../include/features_roles");

// deployment routines in use
const {
	ali_erc20_deploy,
	ali_erc20_deploy_restricted,
	persona_deploy_restricted,
	persona_staking_deploy_restricted,
	nft_staking_deploy_pure,
} = require("./include/deployment_routines");

const { ai_protocol_erc721_deploy } = require("@ai-protocol/ali-nft-contracts/test/include/deployment_routines")

// run NFT staking tests
contract("NFTStaking: AI Personality Staking Tests", function (accounts) {
	// extract accounts to be used:
	// A0 – special default zero account accounts[0] used by Truffle, reserved
	// a0 – deployment account having all the permissions, reserved
	// H0 – initial token holder account
	// a1, a2,... – working accounts to perform tests on
	const [A0, a0, H0, a1, a2, a3, a4, a5] = accounts;

	describe("NFTStaking deployment", function () {
		it("fails if target contract is not set", async function () {
			await expectRevert(nft_staking_deploy_pure(a0, ZERO_ADDRESS), "target contract is not set");
		});
		it("fails if target contract is not valid ERC721", async function () {
			const target = await ali_erc20_deploy_restricted(a0);
			await expectRevert(nft_staking_deploy_pure(a0, target.address), "unexpected target type");
		});
		describe("succeeds otherwise", async function () {
			let target, staking;
			beforeEach(async function () {
				target = await persona_deploy_restricted(a0);
				staking = await nft_staking_deploy_pure(a0, target.address);
			})
			it("isStaked returns false for random token", async function () {
				expect(await staking.isStaked(1)).to.be.false;
			});
			it("target contract is set as expected", async function () {
				expect(await staking.targetContract()).to.be.equal(target.address);
			});
			it("now32() is equal to current block timestamp", async function () {
				const latestBlock = await web3.eth.getBlock("latest");
				expect(await staking.now32()).to.be.bignumber.that.equals(latestBlock.timestamp + "");
			});
		});
	});
	describe("after NFTStaking is deployed", function () {
		// deploy the staking
		let persona, staking, now32;
		beforeEach(async function () {
			({ persona, staking, now32 } = await persona_staking_deploy_restricted(a0));
		});

		it("time now32() is set correctly", async function () {
			expect(await staking.now32()).to.be.bignumber.that.equals(now32 + "");
		});

		describe("NFTStaking ACL", function () {
			const by = a1;
			const token_id = 1;
			beforeEach(async function () {
				await persona.mint(by, token_id, { from: a0 });
				await persona.approve(staking.address, token_id, { from: by });
			});

			async function stake() {
				return await staking.stake(token_id, { from: by });
			}
			describe("when FEATURE_STAKING is disabled", function () {
				beforeEach(async function () {
					await staking.updateFeatures(not(FEATURE_STAKING), { from: a0 });
				});
				it("stake fails", async function () {
					await expectRevert(stake(), "staking is disabled");
				});
			});
			describe("when FEATURE_STAKING is enabled", function () {
				beforeEach(async function () {
					await staking.updateFeatures(FEATURE_STAKING, { from: a0 });
				});
				describe("stake succeeds", function () {
					let receipt;
					beforeEach(async function () {
						receipt = await stake();
					});
					it('"Staked" event is emitted', async function () {
						expectEvent(receipt, "Staked", {
							_by: by,
							_tokenId: token_id + "",
							_when: now32 + "",
						});
					});
					it('"Transfer" event is emitted', async function () {
						await expectEvent.inTransaction(receipt.tx, persona, "Transfer", {
							_from: by,
							_to: staking.address,
							_tokenId: token_id + "",
						});
					});
					it("staked token is transferred to the staking contract", async function () {
						expect(await persona.ownerOf(token_id)).to.be.equal(staking.address);
					});
				});
			});

			async function unstake() {
				return await staking.unstake(token_id, { from: by });
			}
			describe("when staked", function () {
				beforeEach(async function () {
					await staking.updateFeatures(FEATURE_STAKING, { from: a0 });
					await stake();
				});
				describe("when FEATURE_UNSTAKING is disabled", function () {
					beforeEach(async function () {
						await staking.updateFeatures(not(FEATURE_UNSTAKING), { from: a0 });
					});
					it("stake fails", async function () {
						await expectRevert(unstake(), "unstaking is disabled");
					});
				});
				describe("when FEATURE_UNSTAKING is enabled", function () {
					beforeEach(async function () {
						await staking.updateFeatures(FEATURE_UNSTAKING, { from: a0 });
					});
					describe("unstake succeeds", function () {
						let receipt;
						beforeEach(async function () {
							receipt = await unstake();
						});
						it('"Unstaked" event is emitted', async function () {
							expectEvent(receipt, "Unstaked", {
								_by: by,
								_tokenId: token_id + "",
								_when: now32 + "",
							});
						});
						it('"Transfer" event is emitted', async function () {
							await expectEvent.inTransaction(receipt.tx, persona, "Transfer", {
								_from: staking.address,
								_to: by,
								_tokenId: token_id + "",
							});
						});
						it("staked token is transferred back to owner", async function () {
							expect(await persona.ownerOf(token_id)).to.be.equal(by);
						});
					});
				});
			});

			describe("when ERC20 tokens are lost", function () {
				let erc20;
				beforeEach(async function () {
					erc20 = await ali_erc20_deploy(a0, H0);
					await erc20.transfer(staking.address, 1, { from: H0 });
				});
				async function rescueErc20() {
					return await staking.rescueErc20(erc20.address, H0, 1, { from: by });
				}
				describe("when sender doesn't have ROLE_RESCUE_MANAGER permission", function () {
					beforeEach(async function () {
						await staking.updateRole(by, not(ROLE_RESCUE_MANAGER), { from: a0 });
					});
					it("sender can't rescue ERC20 tokens", async function () {
						await expectRevert(rescueErc20(), "access denied");
					});
				});
				describe("when sender has ROLE_RESCUE_MANAGER permission", function () {
					beforeEach(async function () {
						await staking.updateRole(by, ROLE_RESCUE_MANAGER, { from: a0 });
					});
					it("sender can rescue ERC20 tokens", async function () {
						await rescueErc20();
					});
				});
			});
			describe("when ERC721 tokens are lost", function () {
				let erc721;
				beforeEach(async function () {
					erc721 = await ai_protocol_erc721_deploy(a0);
					await erc721.mint(staking.address, 1, { from: a0 });
				});
				async function rescueErc721() {
					return await staking.rescueErc721(erc721.address, H0, 1, { from: by });
				}
				describe("when sender doesn't have ROLE_RESCUE_MANAGER permission", function () {
					beforeEach(async function () {
						await staking.updateRole(by, not(ROLE_RESCUE_MANAGER), { from: a0 });
					});
					it("sender can't rescue ERC721 tokens", async function () {
						await expectRevert(rescueErc721(), "access denied");
					});
				});
				describe("when sender has ROLE_RESCUE_MANAGER permission", function () {
					beforeEach(async function () {
						await staking.updateRole(by, ROLE_RESCUE_MANAGER, { from: a0 });
					});
					it("sender can rescue ERC721 tokens", async function () {
						await rescueErc721();
					});
				});
			});
		});

		describe("Staking/Unstaking", function () {
			const token_id = 1;
			beforeEach(async function () {
				await staking.updateFeatures(FEATURE_STAKING | FEATURE_UNSTAKING, { from: a0 });
				await persona.mint(a1, token_id, { from: a0 });
				await persona.approve(staking.address, token_id, { from: a1 });
			});

			describe("Staking", function () {
				it("fails when staking already staked token", async function () {
					await staking.stake(token_id, { from: a1 });
					await expectRevert(staking.stake(token_id, { from: a1 }), "already staked");
				});
				it("fails when staking a token owned by someone else", async function () {
					await expectRevert(staking.stake(token_id, { from: a2 }), "access denied");
				});
				it("fails when staking a token not approved to be transferred", async function () {
					await persona.approve(ZERO_ADDRESS, token_id, { from: a1 });
					await expectRevert(staking.stake(token_id, { from: a1 }), "access denied");
				});
				describe("succeeds otherwise", function () {
					let receipt;
					beforeEach(async function () {
						receipt = await staking.stake(token_id, { from: a1 });
					});
					it('"Staked" event is emitted', async function () {
						expectEvent(receipt, "Staked", {
							_by: a1,
							_tokenId: token_id + "",
							_when: now32 + "",
						});
					});
					it('"Transfer" event is emitted', async function () {
						await expectEvent.inTransaction(receipt.tx, persona, "Transfer", {
							_from: a1,
							_to: staking.address,
							_tokenId: token_id + "",
						});
					});
					it("isStaked returns true", async function () {
						expect(await staking.isStaked(token_id)).to.be.true;
					});
					it("staked token is transferred to the staking contract", async function () {
						expect(await persona.ownerOf(token_id)).to.be.equal(staking.address);
					});
					it("tokenStakes[token_id] length is increased by one", async function () {
						expect(await staking.methods["numStakes(uint32)"](token_id)).to.be.bignumber.that.equals("1");
					});
					it("userStakes[owner] length is increased by one", async function () {
						expect(await staking.methods["numStakes(address)"](a1)).to.be.bignumber.that.equals("1");
					});
					it('"StakeData" is created', async function () {
						const stake_data = await staking.tokenStakes(token_id, 0);
						expect(stake_data.owner, "unexpected owner").to.equal(a1);
						expect(stake_data.stakedOn, "unexpected stakedOn").to.be.bignumber.that.equals(now32 + "");
						expect(stake_data.unstakedOn, "non-zero unstakedOn").to.be.bignumber.that.equals("0");
					});
					it('"StakeIndex" is created', async function () {
						const stake_index = await staking.userStakes(a1, 0);
						expect(stake_index.tokenId, "unexpected tokenId").to.be.bignumber.that.equals(token_id + "");
						expect(stake_index.index, "unexpected index").to.be.bignumber.that.equals("0");
					});
				});
			});
			describe("Unstaking", function () {
				const token_id2 = token_id + 1;
				beforeEach(async function () {
					await staking.stake(token_id, { from: a1 });
				});
				it("fails when unstaking a token which is not staked", async function () {
					await expectRevert(staking.unstake(token_id2, { from: a1 }), "not staked")
				});
				it("fails when unstaking a token which is already unstaked", async function () {
					staking.unstake(token_id, { from: a1 });
					await expectRevert(staking.unstake(token_id, { from: a1 }), "already unstaked");
				});
				it("fails when unstaking someone else's token", async function () {
					await expectRevert(staking.unstake(token_id, { from: a2 }), "access denied");
				});
				describe("succeeds otherwise", function () {
					let receipt;
					beforeEach(async function () {
						receipt = await staking.unstake(token_id, { from: a1 });
					});
					it('"Unstaked" event is emitted', async function () {
						expectEvent(receipt, "Unstaked", {
							_by: a1,
							_tokenId: token_id + "",
							_when: now32 + "",
						});
					});
					it('"Transfer" event is emitted', async function () {
						await expectEvent.inTransaction(receipt.tx, persona, "Transfer", {
							_from: staking.address,
							_to: a1,
							_tokenId: token_id + "",
						});
					});
					it("isStaked returns false", async function () {
						expect(await staking.isStaked(token_id)).to.be.false;
					});
					it("staked token is transferred back to owner", async function () {
						expect(await persona.ownerOf(token_id)).to.be.equal(a1);
					});
					it("tokenStakes[token_id] length is unchanged", async function () {
						expect(await staking.methods["numStakes(uint32)"](token_id)).to.be.bignumber.that.equals("1");
					});
					it("userStakes[owner] length is unchanged", async function () {
						expect(await staking.methods["numStakes(address)"](a1)).to.be.bignumber.that.equals("1");
					});
					it('"StakeData" is modified', async function () {
						const stake_data = await staking.tokenStakes(token_id, 0);
						expect(stake_data.owner, "unexpected owner").to.equal(a1);
						expect(stake_data.stakedOn, "unexpected stakedOn").to.be.bignumber.that.equals(now32 + "");
						expect(stake_data.unstakedOn, "unexpected unstakedOn").to.be.bignumber.that.equals(now32 + "");
					});
					it('"StakeIndex" is not modified', async function () {
						const stake_index = await staking.userStakes(a1, 0);
						expect(stake_index.tokenId, "unexpected tokenId").to.be.bignumber.that.equals(token_id + "");
						expect(stake_index.index, "unexpected index").to.be.bignumber.that.equals("0");
					});
				});
			});
		})

		describe("Batch Staking/Unstaking", function () {
			const token_ids = [1011, 3019, 8, 99, 23, 8949, 4329, 3321, 33, 849, 2332, 9092];

			beforeEach(async function () {
				await staking.updateFeatures(FEATURE_STAKING | FEATURE_UNSTAKING, { from: a0 });
				for (let token_id of token_ids) {
					await persona.mint(a1, token_id, { from: a0 });
					await persona.approve(staking.address, token_id, { from: a1 });
				}
			});

			describe("after staking a batch", function () {
				let receipt;
				beforeEach(async function () {
					receipt = await staking.stakeBatch(token_ids, { from: a1 });
				});

				token_ids.forEach((token_id, i) => {
					it(`"Staked" event ${i} is emitted`, async function () {
						expectEvent(receipt, "Staked", {
							_by: a1,
							_tokenId: token_id + "",
							_when: now32 + "",
						});
					});
					it(`"Transfer" event ${i} is emitted`, async function () {
						await expectEvent.inTransaction(receipt.tx, persona, "Transfer", {
							_from: a1,
							_to: staking.address,
							_tokenId: token_id + "",
						});
					});
					it(`isStaked ${i} returns true`, async function () {
						expect(await staking.isStaked(token_id)).to.be.true;
					});
					it(`staked token ${i} is transferred to the staking contract`, async function () {
						expect(await persona.ownerOf(token_id)).to.be.equal(staking.address);
					});
					it(`tokenStakes[${i}] length is increased by one`, async function () {
						expect(await staking.methods["numStakes(uint32)"](token_id)).to.be.bignumber.that.equals("1");
					});
					it(`"StakeData" ${i} is created`, async function () {
						const stake_data = await staking.tokenStakes(token_id, 0);
						expect(stake_data.owner, "unexpected owner").to.equal(a1);
						expect(stake_data.stakedOn, "unexpected stakedOn").to.be.bignumber.that.equals(now32 + "");
						expect(stake_data.unstakedOn, "non-zero unstakedOn").to.be.bignumber.that.equals("0");
					});
					it(`"StakeIndex" ${i} is created`, async function () {
						const stake_index = await staking.userStakes(a1, i);
						expect(stake_index.tokenId, "unexpected tokenId").to.be.bignumber.that.equals(token_id + "");
						expect(stake_index.index, "unexpected index").to.be.bignumber.that.equals("0");
					});
				});
				it("userStakes[owner] length is increased by batch size", async function () {
					expect(await staking.methods["numStakes(address)"](a1)).to.be.bignumber.that.equals(token_ids.length + "");
				});
			});
			describe("after unstaking a batch", function () {
				let receipt;
				beforeEach(async function () {
					await staking.stakeBatch(token_ids, { from: a1 });
					receipt = await staking.unstakeBatch(token_ids, { from: a1 });
				});

				token_ids.forEach((token_id, i) => {
					it(`"Unstaked" event ${i} is emitted`, async function () {
						expectEvent(receipt, "Unstaked", {
							_by: a1,
							_tokenId: token_id + "",
							_when: now32 + "",
						});
					});
					it(`"Transfer" event ${i} is emitted`, async function () {
						await expectEvent.inTransaction(receipt.tx, persona, "Transfer", {
							_from: staking.address,
							_to: a1,
							_tokenId: token_id + "",
						});
					});
					it(`isStaked ${i} returns true`, async function () {
						expect(await staking.isStaked(token_id)).to.be.false;
					});
					it(`staked token ${i} is transferred back to owner`, async function () {
						expect(await persona.ownerOf(token_id)).to.be.equal(a1);
					});
					it(`tokenStakes[${i}] length is unchanged`, async function () {
						expect(await staking.methods["numStakes(uint32)"](token_id)).to.be.bignumber.that.equals("1");
					});
					it(`"StakeData" ${i} is modified`, async function () {
						const stake_data = await staking.tokenStakes(token_id, 0);
						expect(stake_data.owner, "unexpected owner").to.equal(a1);
						expect(stake_data.stakedOn, "unexpected stakedOn").to.be.bignumber.that.equals(now32 + "");
						expect(stake_data.unstakedOn, "unexpected unstakedOn").to.be.bignumber.that.equals(now32 + "");
					});
					it(`"StakeIndex" ${i} is not modified`, async function () {
						const stake_index = await staking.userStakes(a1, i);
						expect(stake_index.tokenId, "unexpected tokenId").to.be.bignumber.that.equals(token_id + "");
						expect(stake_index.index, "unexpected index").to.be.bignumber.that.equals("0");
					});
				});
				it("userStakes[owner] length is unchanged", async function () {
					expect(await staking.methods["numStakes(address)"](a1)).to.be.bignumber.that.equals(token_ids.length + "");
				});
			});
		});

		describe("ERC20/ERC721 rescue", function () {
			// deploy the tokens
			let erc20, erc721;
			beforeEach(async function () {
				erc20 = await ali_erc20_deploy(a0, H0);
				erc721 = await ai_protocol_erc721_deploy(a0);
			});
			describe("once ERC20 tokens are lost in the staking contract", function () {
				const value = random_bn(2, 1_000_000_000);
				let receipt;
				beforeEach(async function () {
					receipt = await erc20.transfer(staking.address, value, { from: H0 });
				});
				it('ERC20 "Transfer" event is emitted', async function () {
					await expectEventInTransaction(receipt.tx, "Transfer", [{
						type: "address",
						name: "from",
						indexed: true,
						value: H0,
					}, {
						type: "address",
						name: "to",
						indexed: true,
						value: staking.address,
					}, {
						type: "uint256",
						name: "value",
						value: value,
					}]);
				});
				it("staking contract balance increases as expected", async function () {
					expect(await erc20.balanceOf(staking.address)).to.be.bignumber.that.equals(value);
				});

				function rescue(total_value, rescue_value = total_value) {
					total_value = new BN(total_value);
					rescue_value = new BN(rescue_value);
					let receipt;
					beforeEach(async function () {
						receipt = await staking.rescueErc20(erc20.address, a1, rescue_value, { from: a0 });
					});
					it('ERC20 "Transfer" event is emitted', async function () {
						await expectEventInTransaction(receipt.tx, "Transfer", [{
							type: "address",
							name: "from",
							indexed: true,
							value: staking.address,
						}, {
							type: "address",
							name: "to",
							indexed: true,
							value: a1,
						}, {
							type: "uint256",
							name: "value",
							value: rescue_value,
						}]);
					});
					it("staking contract balance decreases as expected", async function () {
						expect(await erc20.balanceOf(staking.address)).to.be.bignumber.that.equals(total_value.sub(rescue_value));
					});
					it("token recipient balance increases as expected", async function () {
						expect(await erc20.balanceOf(a1)).to.be.bignumber.that.equals(rescue_value);
					});
				}

				describe("can rescue all the tokens", function () {
					rescue(value);
				});
				describe("can rescue some tokens", function () {
					rescue(value, value.subn(1));
				});

				it("cannot rescue more than all the tokens", async function () {
					await expectRevert(
						staking.rescueErc20(erc20.address, a1, value.addn(1), { from: a0 }),
						"transfer amount exceeds balance"
					);
				});
			});
			describe("once ERC721 token is lost in the staking contract", function () {
				const tokenId = random_bn(2, 1_000_000_000);
				let receipt;
				beforeEach(async function () {
					receipt = await erc721.mint(staking.address, tokenId, { from: a0 });
				});
				it('ERC721 "Transfer" event is emitted', async function () {
					expectEvent(receipt, "Transfer", {
						_from: ZERO_ADDRESS,
						_to: staking.address,
						_tokenId: tokenId,
					});
				});
				it("staking contract becomes an owner of the lost token", async function () {
					expect(await erc721.ownerOf(tokenId)).to.be.equal(staking.address);
				});

				describe("can rescue lost token", function () {
					let receipt;
					beforeEach(async function () {
						receipt = await staking.rescueErc721(erc721.address, a1, tokenId, { from: a0 });
					});
					it('ERC721 "Transfer" event is emitted', async function () {
						await expectEvent.inTransaction(receipt.tx, erc721, "Transfer", {
							_from: staking.address,
							_to: a1,
							_tokenId: tokenId,
						});
					});
					it("a1 becomes an owner of the rescued token", async function () {
						expect(await erc721.ownerOf(tokenId)).to.be.equal(a1);
					});
				});
			});
			describe("once ERC721 token is staked", function () {
				const token_id = 1;
				beforeEach(async function () {
					await staking.updateFeatures(FEATURE_STAKING | FEATURE_UNSTAKING, { from: a0 });
					await persona.mint(a1, token_id, { from: a0 });
					await persona.approve(staking.address, token_id, { from: a1 });
				});
				let receipt;
				beforeEach(async function () {
					receipt = await staking.stake(token_id, { from: a1 });
				});
				it("it cannot be rescued", async function () {
					await expectRevert(staking.rescueErc721(persona.address, a1, token_id, { from: a0 }), "token is staked");
				});
			});
		});
	});
});
