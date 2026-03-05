# Local Omnichain Asset Bridge with Governance Recovery

This project demonstrates a **two-chain local asset bridge system** with governance-based recovery mechanisms.
It includes smart contracts deployed on two independent chains, a relayer service responsible for event synchronization, and Docker-based orchestration for running the full environment locally.

## System Overview

The bridge architecture consists of the following components:

* **Chain A (Settlement Layer)**

  * `VaultToken`
  * `BridgeLock`
  * `GovernanceEmergency`

* **Chain B (Execution Layer)**

  * `WrappedVaultToken`
  * `BridgeMint`
  * `GovernanceVoting`

* **Relayer Service**

  * Built using Node.js
  * Tracks processed nonces persistently
  * Applies confirmation delays before processing events

* **Docker Infrastructure**

  * Runs Chain A, Chain B, and the relayer using Docker Compose

* **Testing Suite**

  * Unit tests
  * Integration tests
  * Failure and recovery simulations

---

# Project Directory Structure

```
contracts/        Solidity contracts for both chains
scripts/          Deployment and environment configuration scripts
relayer/          Relayer service implementation + Dockerfile
tests/            Unit, integration, and recovery tests
docker-compose.yml  Full environment orchestration
.env.example      Template for required environment variables
architecture.md   Architecture diagrams and design explanation
```

---

# Prerequisites

Make sure the following tools are installed:

* **Node.js** version 20 or higher
* **npm** version 10 or higher
* **Docker Desktop** for running the multi-container environment

---

# Quick Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create environment configuration

PowerShell:

```powershell
Copy-Item .env.example .env
```

### 3. Start local blockchain nodes

```bash
docker compose up -d chain-a chain-b
```

### 4. Compile and deploy contracts

```bash
npm run compile
npm run deploy:all
```

Deployment scripts will automatically:

* Deploy contracts on both chains
* Generate deployment artifacts
* Update `.env` and `.env.deployments` with contract addresses

### 5. Launch the relayer service

Run locally:

```bash
npm run relayer:start
```

Or run using Docker:

```bash
docker compose up -d relayer
```

---

# Running the Full Docker Environment

Once contract addresses are stored in `.env`, you can launch the entire system with:

```bash
docker compose up -d
```

This will start the following services:

| Service | Port     | Chain ID |
| ------- | -------- | -------- |
| chain-a | 8545     | 1111     |
| chain-b | 9545     | 2222     |
| relayer | internal | —        |

The relayer also stores persistent data in:

```
./relayer_data
```

---

# Available Commands

Compile contracts

```
npm run compile
```

Run unit tests

```
npm test
```

Deploy contracts to Chain A

```
npm run deploy:chain-a
```

Deploy contracts to Chain B

```
npm run deploy:chain-b
```

Deploy to both chains and update environment variables

```
npm run deploy:all
```

Run integration test scenario

```
npm run test:integration
```

Simulate relayer recovery scenario

```
npm run test:recovery
```

---

# Relayer Reliability Design

The relayer is designed to maintain stability and avoid replay attacks.

Key mechanisms include:

* Persistent storage of processed event IDs
* JSON-based database with atomic write operations
* Tracking of the last scanned block on each chain
* Waiting for a configurable number of confirmation blocks
* Automatic retry logic for RPC requests and transactions
* Recovery scanning after relayer restarts to process missed events

---

# Security and Core Invariants

The bridge enforces several critical safety guarantees.

### Replay Protection

* `BridgeMint.mintWrapped` rejects duplicate mint nonces
* `BridgeLock.unlock` rejects reused unlock nonces

### Access Control

Smart contracts use role-based permissions:

* `RELAYER_ROLE`
* `GOVERNANCE_ROLE`

### Emergency Governance

If governance approves a proposal:

1. `GovernanceVoting` emits a `ProposalPassed` event
2. The relayer triggers `GovernanceEmergency.executeEmergency`
3. `BridgeLock` on Chain A is paused

### Supply Invariant

At all times the system must satisfy:

```
VaultToken.balanceOf(BridgeLock)
    ==
WrappedVaultToken.totalSupply()
```

This invariant is verified during integration testing.

---

# Testing

## Unit Tests

Run:

```
npm test
```

Unit tests cover:

* Token locking and unlocking logic
* Replay attack protection
* Burn and mint processes
* Governance event behavior

---

## Integration Tests

Run:

```
npm run test:integration
```

Integration scenarios include:

* Lock → mint flow after confirmation delay
* Burn → unlock flow
* Supply invariant verification
* Governance proposal execution and bridge pause

---

## Relayer Recovery Simulation

Run:

```
npm run test:recovery
```

Scenario:

1. Stop the relayer
2. Generate a lock event while offline
3. Restart the relayer
4. Verify that the missed event is processed correctly

---

# Notes

* Docker commands will fail if the **Docker daemon is not running**. Make sure Docker Desktop is started.
* If using manually started nodes instead of Docker, ensure that:

  * RPC URLs match `.env`
  * Chain IDs match the expected values.
