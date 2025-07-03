# Transaction Module

This npm module provides robust utilities to send blockchain transactions using either:

- **ethers.js Wallet**
- **viem WalletClient + PublicClient**

It manages nonce synchronization across processes using Redis (if configured) or in-memory storage. It also implements retry logic to handle nonce errors and transaction failures automatically.

---

## Installation

```bash
npm i concurrent-tx
```

---

## Example — ethers

```ts
import { sendTransaction } from "concurrent-tx"
const pk = YOUR_PK
const rpc = YOUR_RPC
const wallet = new Wallet(pk, rpc)
const result = await sendTransaction({
  wallet,
  chainId: 1,
  tx: {
    to: "0x123...",
    data: "10000000000000000",
    gasLimit: 21000,
  },
})
console.log(result)
```

## Example — viem

```ts
import { createWalletClient, createPublicClient, http } from "viem"
import { mainnet } from "viem/chains"
import { privateKeyToAccount } from "viem/accounts"
import { sendTransaction } from "concurrent-tx"

const pk = YOUR_PK

const account = privateKeyToAccount(pk)
const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http(),
})
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
})

const receipt = await sendTransaction({
  walletClient,
  publicClient,
  chainId: 1,
  tx: {
    to: "0xabc...",
    value: BigInt("10000000000000000"),
    gas: 21000,
  },
})

console.log(receipt)
```

---

## API Reference

## `sendTransaction`

```ts
sendTransaction({
  wallet,
  walletClient,
  publicClient,
  chainId,
  options,
  tx,
})
```

### Parameters

| Name           | Type                                 | Required | Description                                                  |
| -------------- | ------------------------------------ | -------- | ------------------------------------------------------------ |
| `wallet`       | `Wallet` (ethers.js)                 | No       | Ethers Wallet instance for signing and sending transactions. |
| `walletClient` | `WalletClient` (viem)                | No       | Viem WalletClient for sending transactions programmatically. |
| `publicClient` | `PublicClient<any, any, any>` (viem) | No       | Viem PublicClient for waiting on transaction receipts.       |
| `chainId`      | `number`                             | Yes      | Chain ID of the network (e.g. `1` for Ethereum Mainnet).     |
| `options`      | `Record<string, any>`                | No       | Additional configuration options for the module.             |
| `tx`           | `Record<string, string \| number>`   | Yes      | Transaction data object (to, value, data, gas, etc.).        |

> Either `wallet` or both `walletClient` and `publicClient` must be provided.

### Returns

- `Promise<any>` — The transaction receipt object.

---

## Configuration Options

You can override module-level config values via the `options` argument:

```ts
await sendTransaction({
  chainId: 1,
  tx: { ... },
  options: {
    redis: { host: "...", port: 6379 },
    log: console.log,
  },
})
```

- **redis** — Redis connection details for distributed nonce storage.
- **log** — Logging function for debug/error output.

---

## Error Handling

This module automatically:

- Retries on known nonce-related errors.
- Sends a zero-value transaction to clear stale nonces if needed.
- Logs errors via `CONFIG.log` if provided.

If all retries fail, it rejects with:

```
"Transaction Failed"
```

---

---

## License

MIT
