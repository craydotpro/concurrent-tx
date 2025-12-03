# concurrent-tx

A robust transaction-sending utility built on viem, designed for real-world production workloads where nonce management, retries, and dropped transaction handling are critical.

This library solves the biggest pain points in Ethereum transaction automation:

- 🚫 No more nonce collisions
- 🔁 Automatic retry system
- ⚡ Priority fee auto-bumping
- 🧹 Dropped transaction detection + recovery
- 🔄 Invalid nonce auto-correction
- 🕒 Handles concurrent sends safely

Ideal for bots, high-frequency transaction systems, scripts, and backend services.

---

## Installation

```bash
npm i concurrent-tx
```

---

## Example — viem

```ts
import { createWalletClient, createPublicClient, http } from "viem"
import { mainnet } from "viem/chains"
import { privateKeyToAccount } from "viem/accounts"
import ConcurrentTx from "concurrent-tx"

const pk = YOUR_PK

const concurrentTx = new ConcurrentTx()

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

const receipt = await concurrentTx.Send({
  walletClient,
  publicClient,
  tx: {
    to: "0xabc...",
    value: BigInt("10000000000000000"),
    gas: 21000,
    account,
  },
})

console.log(receipt)
```

---

### Parameters

| Name                                           | Type                               | Required | Description                                                  |
| ---------------------------------------------- | ---------------------------------- | -------- | ------------------------------------------------------------ |
| instance for signing and sending transactions. |
| `walletClient`                                 | `WalletClient`                     | Yes      | Viem WalletClient for sending transactions programmatically. |
| `publicClient`                                 | `PublicClient<any, any, any>`      | Yes      | Viem PublicClient for waiting on transaction receipts.       |
| `tx`                                           | `Record<string, string \| number>` | Yes      | Transaction data object (to, value, data, gas, etc.).        |
| `logger`                                       | `Function`                         | No       | logger Function console.debug Called on all internal logs    |

### Returns

- `Promise<any>` — The transaction receipt object.

---

## API Reference

### new Transaction({ MAX_TRY? })

Option Type Default Description
MAX_TRY number 4 Maximum retry attempts per tx

## Error Handling

This module automatically:

- Retries on known nonce-related errors.
- Sends a zero-value transaction to clear stale nonces if needed.

If all retries fail, it rejects with:

```
"Transaction Failed"
```

---

---

## License

MIT
