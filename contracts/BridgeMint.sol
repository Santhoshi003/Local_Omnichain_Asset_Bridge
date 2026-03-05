// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {WrappedVaultToken} from "./WrappedVaultToken.sol";

contract BridgeMint is AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    WrappedVaultToken public immutable wrappedToken;

    uint256 public nextBurnNonce;
    mapping(uint256 => bool) public processedMintNonces;

    event Burned(address indexed user, uint256 amount, uint256 nonce);
    event Minted(address indexed user, uint256 amount, uint256 nonce);

    constructor(address wrappedTokenAddress, address admin) {
        wrappedToken = WrappedVaultToken(wrappedTokenAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, admin);
    }

    function mintWrapped(address user, uint256 amount, uint256 nonce) external onlyRole(RELAYER_ROLE) {
        require(!processedMintNonces[nonce], "mint nonce used");
        processedMintNonces[nonce] = true;

        wrappedToken.mint(user, amount);
        emit Minted(user, amount, nonce);
    }

    function burn(uint256 amount) external {
        wrappedToken.burnFrom(msg.sender, amount);

        uint256 nonce = nextBurnNonce;
        unchecked {
            nextBurnNonce = nonce + 1;
        }

        emit Burned(msg.sender, amount, nonce);
    }
}
