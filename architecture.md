# Omnichain Bridge Architecture

```mermaid
flowchart LR
  subgraph ChainA[Chain A - Settlement]
    VT[VaultToken ERC20]
    BL[BridgeLock]
    GE[GovernanceEmergency]
    VT -->|lock transferFrom| BL
    GE -->|pauseFromGovernance| BL
  end

  subgraph ChainB[Chain B - Execution]
    WVT[WrappedVaultToken ERC20]
    BM[BridgeMint]
    GV[GovernanceVoting]
    BM -->|mint/burnFrom| WVT
    GV -->|ProposalPassed| Relayer
  end

  User[User]
  Relayer[Node.js Relayer\nJSON Persistence + Confirmation Depth]

  User -->|lock(amount)| BL
  BL -->|Locked(user,amount,nonce)| Relayer
  Relayer -->|mintWrapped(user,amount,nonce)| BM

  User -->|burn(amount)| BM
  BM -->|Burned(user,amount,nonce)| Relayer
  Relayer -->|unlock(user,amount,nonce)| BL

  GV -->|ProposalPassed(proposalId,data)| Relayer
  Relayer -->|executeEmergency(data)| GE
```
