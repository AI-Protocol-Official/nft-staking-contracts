// Both Truffle and Hardhat with Truffle make instances of web3 and artifacts available in the global scope

// web3 utils
const BN = web3.utils.BN;
const toWei = web3.utils.toWei;

// ACL token features and roles
const {
	FEATURE_LINKING,
	FEATURE_UNLINKING,
	FEATURE_DEPOSITS,
	FEATURE_WITHDRAWALS,
	FEATURE_ALL,
	ROLE_TOKEN_CREATOR,
	ROLE_MINTER,
	ROLE_BURNER,
	ROLE_EDITOR,
} = require("../../include/features_roles");

// block utils
const { default_deadline } = require("../../include/block_utils");

/**
 * Deploys AliERC20 token with all the features enabled
 *
 * @param a0 smart contract owner, super admin
 * @param H0 initial token holder address
 * @returns AliERC20 instance
 */
async function ali_erc20_deploy(a0, H0 = a0) {
	// deploy ALI token
	const token = await ali_erc20_deploy_restricted(a0, H0);

	// enable all permissions on the token
	await token.updateFeatures(FEATURE_ALL, { from: a0 });

	// return the reference
	return token;
}

/**
 * Deploys AliERC20 token with no features enabled
 *
 * @param a0 smart contract owner, super admin
 * @param H0 initial token holder address
 * @returns AliERC20 instance
 */
async function ali_erc20_deploy_restricted(a0, H0 = a0) {
	// smart contracts required
	const AliERC20 = artifacts.require("./AliERC20v2");

	// deploy and return the reference to instance
	return await AliERC20.new(H0, { from: a0 });
}



/**
 * Deploys Personality Pod ERC721 token with all the features enabled
 *
 * @param a0 smart contract owner, super admin
 * @param name ERC721 name, optional, default value "iNFT Personality Pod"
 * @param symbol ERC721 symbol, optional, default value "POD"
 * @returns PersonalityPodERC721 instance
 */
async function persona_deploy(a0, name, symbol) {
	// deploy the token
	const token = await persona_deploy_restricted(a0, name, symbol);

	// enable all permissions on the token
	await token.updateFeatures(FEATURE_ALL, { from: a0 });

	// return the reference
	return token;
}

/**
 * Deploys Personality Pod ERC721 token with no features enabled
 *
 * @param a0 smart contract owner, super admin
 * @param name ERC721 name, optional, default value "iNFT Personality Pod"
 * @param symbol ERC721 symbol, optional, default value "POD"
 * @returns PersonalityPodERC721 instance
 */
async function persona_deploy_restricted(a0, name = "iNFT Personality Pod", symbol = "POD") {
	// smart contracts required
	const PersonalityPodERC721 = artifacts.require("./PersonalityPodERC721");

	// deploy and return the reference to instance
	return await PersonalityPodERC721.new(name, symbol, { from: a0 });
}

/**
 * Deploys Intelligent NFT v2
 *
 * If ALI ERC20 token instance address is specified – binds iNFT to it, deploys new one otherwise
 *
 * @param a0 smart contract owner, super admin
 * @param ali_addr AliERC20 token address, optional
 * @returns AliERC20 token instance, IntelligentNFTv2 instance
 */
async function intelligent_nft_deploy(a0, ali_addr) {
	// smart contracts required
	const AliERC20 = artifacts.require("./AliERC20v2");
	const IntelligentNFTv2 = artifacts.require("./IntelligentNFTv2");

	// link/deploy the contracts
	const ali = ali_addr ? await AliERC20.at(ali_addr) : await ali_erc20_deploy(a0);
	const iNft = await IntelligentNFTv2.new(ali.address, { from: a0 });

	// return all the linked/deployed instances
	return { ali, iNft };
}


/**
 * Deploys PersonalityDrop with no features enabled, but all the required roles set up
 *
 * If PersonalityPodERC721 instance address is specified, binds the drop to it
 *
 * @param a0 smart contract owner, super admin
 * @param persona_addr PersonalityPodERC721 token Airdrop is going to mint, optional
 * @returns PersonalityDrop, PersonalityPodERC721 instances
 */
async function persona_drop_deploy_restricted(a0, persona_addr) {
	// smart contracts required
	const PersonalityPodERC721 = artifacts.require("./PersonalityPodERC721");

	// link/deploy the contracts
	const persona = persona_addr ? await PersonalityPodERC721.at(persona_addr) : await persona_deploy(a0);
	const airdrop = await nft_drop_deploy_pure(a0, persona.address);

	// grant sale permission to mint tokens
	await persona.updateRole(airdrop.address, ROLE_TOKEN_CREATOR, { from: a0 });

	// return all the linked/deployed instances
	return { persona, airdrop };
}


/**
 * Deploys NFTStaking with no features enabled, but all the required roles set up
 *
 * If PersonalityPodERC721 instance address is specified, binds staking to it
 *
 * @param a0 smart contract owner, super admin
 * @param persona_addr PersonalityPodERC721 token staking would accept, optional
 * @returns NFTStaking, PersonalityPodERC721 instances, "current" timestamp
 */
async function persona_staking_deploy_restricted(a0, persona_addr) {
	// smart contracts required
	const PersonalityPodERC721 = artifacts.require("./PersonalityPodERC721");

	// link/deploy the contracts
	const persona = persona_addr ? await PersonalityPodERC721.at(persona_addr) : await persona_deploy(a0);
	const staking = await nft_staking_deploy_pure(a0, persona.address);

	// override current time on the staking mock
	const now32 = 1_000_000_000;
	await staking.setNow32(now32, { from: a0 });

	// return all the linked/deployed instances
	return { persona, staking, now32 };
}

/**
 * Deploys NFTStaking with no features enabled, and no roles set up
 *
 * Requires a valid ERC721 instance address to be specified
 *
 * @param a0 smart contract owner, super admin
 * @param nft_addr ERC721 token staking would accept, required
 * @returns NFTStaking instance
 */
async function nft_staking_deploy_pure(a0, nft_addr) {
	// smart contracts required
	const NFTStaking = artifacts.require("./NFTStakingMock");

	// deploy and return the reference to instance
	return await NFTStaking.new(nft_addr, { from: a0 });
}

// export public deployment API
module.exports = {
	ali_erc20_deploy,
	ali_erc20_deploy_restricted,
	persona_deploy,
	persona_deploy_restricted,
	intelligent_nft_deploy,
	persona_drop_deploy_restricted,
	persona_staking_deploy_restricted,
	nft_staking_deploy_pure,
};
