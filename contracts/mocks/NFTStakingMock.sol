// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../protocol/NFTStaking.sol";

/// @dev Allows to override now32() on the NFTStaking
contract NFTStakingMock is NFTStaking {
	/// @dev Overrides now32() if set (non-zero)
	uint32 private _now32;

	/// @dev Deploys NFTStakingMock passing all the params to NFTStaking
	constructor(address _nft) NFTStaking(_nft) {}

	/// @inheritdoc NFTStaking
	function now32() public view override returns (uint32) {
		// override now32 if it is set, delegate to super otherwise
		return _now32 > 0? _now32: super.now32();
	}

	/// @dev Sets/removes now32() override (set to zero to remove)
	function setNow32(uint32 _value) public {
		_now32 = _value;
	}
}
