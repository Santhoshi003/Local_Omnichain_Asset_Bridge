// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract WrappedVaultToken is ERC20, AccessControl {
    bytes32 public constant BRIDGE_MINT_ROLE = keccak256("BRIDGE_MINT_ROLE");

    constructor(address admin) ERC20("Wrapped Vault Token", "wVAULT") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function mint(address to, uint256 amount) external onlyRole(BRIDGE_MINT_ROLE) {
        _mint(to, amount);
    }

    function burnFrom(address from, uint256 amount) external onlyRole(BRIDGE_MINT_ROLE) {
        _burn(from, amount);
    }
}
