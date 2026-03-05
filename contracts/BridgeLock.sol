// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract BridgeLock is AccessControl, Pausable {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");

    IERC20 public immutable vaultToken;

    uint256 public nextLockNonce;
    mapping(uint256 => bool) public processedUnlockNonces;

    event Locked(address indexed user, uint256 amount, uint256 nonce);
    event Unlocked(address indexed user, uint256 amount, uint256 nonce);

    constructor(address token, address admin) {
        vaultToken = IERC20(token);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, admin);
    }

    function lock(uint256 amount) external whenNotPaused {
        require(amount > 0, "amount=0");
        bool ok = vaultToken.transferFrom(msg.sender, address(this), amount);
        require(ok, "transfer failed");

        uint256 nonce = nextLockNonce;
        unchecked {
            nextLockNonce = nonce + 1;
        }

        emit Locked(msg.sender, amount, nonce);
    }

    function unlock(address user, uint256 amount, uint256 nonce) external onlyRole(RELAYER_ROLE) {
        require(!processedUnlockNonces[nonce], "unlock nonce used");
        processedUnlockNonces[nonce] = true;

        bool ok = vaultToken.transfer(user, amount);
        require(ok, "transfer failed");

        emit Unlocked(user, amount, nonce);
    }

    function pauseFromGovernance() external onlyRole(GOVERNANCE_ROLE) {
        _pause();
    }

    function unpauseFromGovernance() external onlyRole(GOVERNANCE_ROLE) {
        _unpause();
    }
}
