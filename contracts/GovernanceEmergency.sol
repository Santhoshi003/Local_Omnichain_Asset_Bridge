// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {BridgeLock} from "./BridgeLock.sol";

contract GovernanceEmergency is AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    BridgeLock public immutable bridgeLock;

    event EmergencyExecuted(bytes data);

    constructor(address bridgeLockAddress, address admin) {
        bridgeLock = BridgeLock(bridgeLockAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, admin);
    }

    function pauseBridge() external onlyRole(RELAYER_ROLE) {
        bridgeLock.pauseFromGovernance();
        emit EmergencyExecuted(abi.encodeWithSelector(BridgeLock.pauseFromGovernance.selector));
    }

    function executeEmergency(bytes calldata data) external onlyRole(RELAYER_ROLE) {
        bytes4 selector;
        assembly {
            selector := calldataload(data.offset)
        }
        require(selector == BridgeLock.pauseFromGovernance.selector, "unsupported selector");

        (bool ok,) = address(bridgeLock).call(data);
        require(ok, "emergency call failed");

        emit EmergencyExecuted(data);
    }
}
