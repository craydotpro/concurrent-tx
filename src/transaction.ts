import { Wallet } from "ethers"
import { CONFIG, ERRORS, NONCE_USED_ERROR } from "./constants"
import { initRedis } from "./redis"
import * as CHAINS from "viem/chains"
import { createPublicClient, http, PublicClient, WalletClient } from "viem"
import { _sleep } from "./utils"

let chainMap = Object.keys(CHAINS).reduce((obj, key) => {
  obj[CHAINS[key].id] = key
  return obj
}, {})

class Transaction {
  initializedNonces = new Map()
  redisClient
  memoryStorage = new Map()
  _etherWalletTxSend = async (wallet, tx) => {
    const response = await wallet.sendTransaction(tx)
    // console.log("response:::", response)
    let res = await response.wait()

    if (response.data === "0x") {
      /** if empty transaction */
      return Promise.reject("Transaction Failed")
    }
    return res
  }
  _viemWalletTxSend = async (wallet, tx) => {
    let hash = await wallet.sendTransaction(tx)
    const transaction = await wallet.waitForTransactionReceipt({ hash })
    if (transaction.data === "0x") {
      /** if empty transaction */
      return Promise.reject("Transaction Failed")
    }
    return transaction
  }
  InitializeNonce = async (walletAddress, chainId) => {
    if (this.initializedNonces.get(walletAddress + chainId) !== undefined) return
    if (!this.redisClient && CONFIG.redis) {
      this.redisClient = await initRedis(CONFIG.redis)
    }
    const chain = CHAINS[chainMap[chainId]]
    const publicClient = createPublicClient({
      chain,
      transport: http(),
    })
    let pendingNonce = await publicClient.getTransactionCount({ address: walletAddress, blockTag: "pending" })
    const key = `nonce:${walletAddress}:${chainId}`
    if (this.initializedNonces.get(walletAddress + chainId) !== undefined) return

    this.initializedNonces.set(walletAddress + chainId, pendingNonce)
    if (this.redisClient) {
      await this.redisClient.SET(key, pendingNonce)
    } else {
      this.memoryStorage.set(key, pendingNonce)
    }
  }
  GetNextNonce = async (walletAddress, chainId) => {
    const key = `nonce:${walletAddress}:${chainId}`
    if (this.redisClient) {
      return (await this.redisClient.incr(key, 1)) - 1
    } else {
      let nonce = this.memoryStorage.get(key)
      this.memoryStorage.set(key, nonce + 1)
      return nonce
    }
  }
  Send = async ({ wallet, walletClient, publicClient, tx, emptyTx }: { wallet?: Wallet; walletClient?: WalletClient; publicClient?: PublicClient<any, any, any>; tx: any; emptyTx?: boolean }) => {
    try {
      let res
      if (wallet) {
        const response = await wallet.sendTransaction(tx)
        res = await response.wait()
      } else {
        let hash = await walletClient.sendTransaction(tx)
        res = await publicClient.waitForTransactionReceipt({ hash })
      }
      if (emptyTx) {
        CONFIG.log("Transaction dropped")
        return Promise.reject("Transaction dropped")
      } else {
        return res
      }
    } catch (error) {
      CONFIG.log(error)
      await _sleep(1000)
      if (NONCE_USED_ERROR.some((errorString) => String(error).includes(errorString))) {
        return Promise.reject("Transaction Failed")
      }
      if (ERRORS.some((errorString) => String(error).includes(errorString))) {
        /** try zero tx if failed with valid reason */
        tx = { to: tx.to, nonce: tx.nonce, value: 0 }
        return this.Send({ wallet, walletClient, publicClient, tx, emptyTx: true })
      }
      return this.Send({ wallet, walletClient, publicClient, tx })
    }
  }
  sendTransaction = async ({
    wallet,
    walletClient,
    publicClient,
    chainId,
    tx,
  }: {
    wallet?: Wallet
    walletClient?: WalletClient
    publicClient?: PublicClient<any, any, any>
    chainId: number
    tx: any
  }) => {
    let walletAddress = wallet?.address || walletClient?.account?.address
    await this.InitializeNonce(walletAddress, chainId)

    if (!tx.nonce) {
      tx.nonce = tx.nonce || (await this.GetNextNonce(walletAddress, chainId))
    }
    return this.Send({ wallet, walletClient, publicClient, tx })
  }
}
const transaction = new Transaction()
export default transaction
