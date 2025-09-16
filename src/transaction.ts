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
  GetCurrentNonce = async (walletAddress, chainId) => {
    const key = `nonce:${walletAddress}:${chainId}`
    if (this.redisClient) {
      return await this.redisClient.get(key)
    } else {
      return this.memoryStorage.get(key)
    }
  }
  DecreaseNonce = async (walletAddress, chainId) => {
    const key = `nonce:${walletAddress}:${chainId}`
    if (this.redisClient) {
      return await this.redisClient.incr(key, -1)
    } else {
      let nonce = this.memoryStorage.get(key)
      this.memoryStorage.set(key, nonce - 1)
      return nonce
    }
  }
  Send = async ({
    wallet,
    walletClient,
    publicClient,
    tx,
    emptyTx,
    chainId,
    tryCount,
    txHash,
  }: {
    wallet?: Wallet
    walletClient?: WalletClient
    publicClient?: PublicClient<any, any, any>
    tx: any
    emptyTx?: boolean
    chainId: number
    tryCount: number
    txHash?: `0x${string}`
  }) => {
    if (tryCount > CONFIG.MAX_TRY) return Promise.reject("Transaction Failed More than Max Try")
    let res
    try {
      if (wallet) {
        let transaction
        if (txHash) {
          transaction = await wallet.provider.getTransaction(txHash)
        } else {
          transaction = await wallet.sendTransaction(tx)
          txHash = transaction.hash
        }

        res = await transaction.wait()
        if (!res.status) {
          /** if reverted */
          return Promise.reject(res)
        }
      } else {
        txHash = await walletClient.sendTransaction(tx)
        res = await publicClient.waitForTransactionReceipt({ hash: txHash })
        if (res.status !== "success") {
          /** if reverted */
          return Promise.reject(res)
        }
      }
      if (emptyTx) {
        if (CONFIG.debug) CONFIG.log("Transaction dropped")
        return Promise.reject("Transaction dropped")
      } else {
        return res
      }
    } catch (error) {
      let walletAddress = wallet?.address || walletClient?.account?.address || tx.account?.address
      if (!String(error).includes("Too Many Requests")) {
        tryCount++
      } else {
        if (CONFIG.debug) CONFIG.log("######RPC Error", tx.nonce)
      }
      await _sleep(1000)
      if (ERRORS.some((errorString) => String(error).includes(errorString))) {
        const currentNonce = await this.GetCurrentNonce(walletAddress, chainId)
        if (tx.nonce === currentNonce) {
          /** if no other transaction in the queue */
          if (CONFIG.debug) CONFIG.log("Tx Failed, and nonce free", tx.nonce)
          await this.DecreaseNonce(walletAddress, chainId)
          return Promise.reject("Transaction Failed")
        } else {
          if (CONFIG.debug) CONFIG.log("Tx Dropped", tx.nonce)
          if (CONFIG.log_error) CONFIG.log(error)
          /** try zero tx if failed with valid reason */
          tx = { to: tx.to, nonce: tx.nonce, value: 0 }
          return this.Send({ wallet, walletClient, publicClient, tx, emptyTx: true, chainId, tryCount, txHash })
        }
      }
      if (NONCE_USED_ERROR.some((errorString) => String(error).includes(errorString))) {
        // increase nonce
        const match = String(error).match(/nonce too low: next nonce ([^]*?), tx nonce/)
        if (match) {
          const key = `nonce:${walletAddress}:${chainId}`
          if (this.redisClient) {
            await this.redisClient.SET(key, match[1])
          } else {
            this.memoryStorage.set(key, match[1])
          }
        }
        const nextNonce = await this.GetNextNonce(walletAddress, chainId)
        CONFIG.log("Retrying With Next nonce", tx.nonce, nextNonce)
        tx.nonce = nextNonce
      }
      if (!String(error).includes("Too Many Requests")) {
        CONFIG.log(tx.nonce, error)
      }
      return this.Send({ wallet, walletClient, publicClient, tx, chainId, tryCount, txHash })
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
    let walletAddress = wallet?.address || walletClient?.account?.address || tx.account?.address
    await this.InitializeNonce(walletAddress, chainId)
    if (!tx.nonce) {
      tx.nonce = tx.nonce || (await this.GetNextNonce(walletAddress, chainId))
    }
    return this.Send({ wallet, walletClient, publicClient, tx, chainId, tryCount: 0 })
  }
}
const transaction = new Transaction()
export default transaction
