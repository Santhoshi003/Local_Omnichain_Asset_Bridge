// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {WrappedVaultToken} from "./WrappedVaultToken.sol";

contract GovernanceVoting {
    struct Proposal {
        bytes data;
        uint256 deadlineBlock;
        uint256 yesVotes;
        uint256 noVotes;
        bool executed;
    }

    WrappedVaultToken public immutable votingToken;
    uint256 public immutable minYesVotes;
    uint256 public nextProposalId;

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event ProposalCreated(uint256 indexed proposalId, bytes data, uint256 deadlineBlock);
    event ProposalVoted(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);
    event ProposalPassed(uint256 proposalId, bytes data);

    constructor(address wrappedTokenAddress, uint256 minYesVotes_) {
        votingToken = WrappedVaultToken(wrappedTokenAddress);
        minYesVotes = minYesVotes_;
    }

    function createProposal(bytes calldata data, uint256 votingPeriodBlocks) external returns (uint256 proposalId) {
        require(votingToken.balanceOf(msg.sender) > 0, "no voting power");
        require(votingPeriodBlocks > 0, "period=0");

        proposalId = nextProposalId;
        unchecked {
            nextProposalId = proposalId + 1;
        }

        proposals[proposalId] = Proposal({
            data: data,
            deadlineBlock: block.number + votingPeriodBlocks,
            yesVotes: 0,
            noVotes: 0,
            executed: false
        });

        emit ProposalCreated(proposalId, data, block.number + votingPeriodBlocks);
    }

    function vote(uint256 proposalId, bool support) external {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.deadlineBlock != 0, "proposal missing");
        require(block.number <= proposal.deadlineBlock, "voting ended");
        require(!hasVoted[proposalId][msg.sender], "already voted");

        uint256 weight = votingToken.balanceOf(msg.sender);
        require(weight > 0, "no voting power");

        hasVoted[proposalId][msg.sender] = true;
        if (support) {
            proposal.yesVotes += weight;
        } else {
            proposal.noVotes += weight;
        }

        emit ProposalVoted(proposalId, msg.sender, support, weight);
    }

    function finalize(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.deadlineBlock != 0, "proposal missing");
        require(block.number > proposal.deadlineBlock, "voting active");
        require(!proposal.executed, "already finalized");

        proposal.executed = true;
        if (proposal.yesVotes > proposal.noVotes && proposal.yesVotes >= minYesVotes) {
            emit ProposalPassed(proposalId, proposal.data);
        }
    }
}
