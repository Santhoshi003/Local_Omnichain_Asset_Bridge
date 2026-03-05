# Local Omnichain Asset Bridge with Governance Recovery

Two-chain local bridge implementation with:

- Chain A settlement contracts (`VaultToken`, `BridgeLock`, `GovernanceEmergency`)
- Chain B execution contracts (`WrappedVaultToken`, `BridgeMint`, `GovernanceVoting`)
- Node.js relayer with persistent processed-nonce tracking and confirmation delay
- Docker Compose orchestration for `chain-a`, `chain-b`, and `relayer`
- Unit tests + integration/failure simulation scripts

## Project Structure

- `contracts/` Solidity contracts for both chains
- `scripts/` deployment and environment sync scripts
- `relayer/` relayer service and Dockerfile
- `tests/` unit + integration + recovery tests
- `docker-compose.yml` full stack orchestration
- `.env.example` required variables template
- `architecture.md` system diagram

## Requirements

- Node.js 20+
- npm 10+
- Docker Desktop (for `docker compose` flow)

## Quick Start

1. Install dependencies:
   - `npm install`
2. Create env file:
   - `Copy-Item .env.example .env` (PowerShell)
3. Start chains (Docker):
   - `docker compose up -d chain-a chain-b`
4. Compile + deploy on both chains:
   - `npm run compile`
   - `npm run deploy:all`
   - This writes deployment files and updates `.env`/`.env.deployments` contract addresses.
5. Start relayer:
   - Local: `npm run relayer:start`
   - Docker: `docker compose up -d relayer`

## Full Docker Orchestration

After `.env` contains deployed addresses, run:

- `docker compose up -d`

Services:

- `chain-a` on `8545` (Anvil chain ID `1111`)
- `chain-b` on `9545` (Anvil chain ID `2222`)
- `relayer` with mounted persistence volume `./relayer_data`

## Commands

- Compile: `npm run compile`
- Unit tests: `npm test`
- Deploy Chain A: `npm run deploy:chain-a`
- Deploy Chain B: `npm run deploy:chain-b`
- Deploy both + sync env: `npm run deploy:all`
- Integration script: `npm run test:integration`
- Recovery script: `npm run test:recovery`

## Relayer Reliability Design

- Persistence in JSON file (`DB_PATH`) with atomic temp-file rename writes
- Stores processed IDs to block replay processing after restart
- Stores last scanned blocks for both chains
- Waits `CONFIRMATION_DEPTH` blocks before acting
- Retries RPC and transaction submissions (`retry` strategy)
- On restart, scans historical ranges from last stored blocks to catch missed events

## Core Invariants & Security

- Replay protection on-chain:
  - `BridgeMint.mintWrapped` rejects reused mint nonce
  - `BridgeLock.unlock` rejects reused unlock nonce
- Bridge authorization via `AccessControl` roles (`RELAYER_ROLE`, `GOVERNANCE_ROLE`)
- Emergency pause path:
  - `GovernanceVoting` emits `ProposalPassed`
  - relayer calls `GovernanceEmergency.executeEmergency`
  - Chain A `BridgeLock` is paused
- Supply invariant to verify in integration:
  - `VaultToken.balanceOf(BridgeLock) == WrappedVaultToken.totalSupply()`

## Testing

### Unit

- `npm test`
- Covers:
  - lock/unlock flow
  - replay attack prevention (mint + unlock)
  - burn flow
  - governance event emission and pause behavior

### Integration

- `npm run test:integration`
- Covers:
  - lock -> mint after confirmations
  - burn -> unlock after confirmations
  - supply invariant checks before/after burn
  - governance pass -> bridge pause

### Relayer Recovery Simulation

- `npm run test:recovery`
- Steps:
  - stop relayer
  - create lock event while offline
  - restart relayer
  - assert missed event is processed

## Notes

- If Docker daemon is not running, compose commands fail even if `docker compose version` works. Start Docker Desktop first.
- If running ad-hoc local nodes instead of Docker, ensure chain IDs and RPC URLs match `.env` values.
