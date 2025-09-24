import { Hex, PublicClient, WalletClient } from "viem"
import * as CHAINS from "viem/chains"
import { CONFIG, ERRORS } from "./constants"
import { initRedis } from "./redis"
import { _sleep } from "./utils"

let chainMap = Object.keys(CHAINS).reduce((obj, key) => {
  obj[CHAINS[key].id] = key
  return obj
}, {})
class Transaction {
  initializedNonces = new Map()
  redisClient
  memoryStorage = new Map()

  keyNonce(address: string, chainId: number) {
    return `nonce:${address.toLowerCase()}:${chainId}`
  }

  InitializeNonce = async (address, chainId, publicClient) => {
    const walletAddress = address.toLowerCase()
    if (this.initializedNonces.get(walletAddress + chainId) !== undefined) return
    if (!this.redisClient && CONFIG.redis) {
      this.redisClient = await initRedis(CONFIG.redis)
    }
    // const chain = CHAINS[chainMap[chainId]]
    // const publicClient = createPublicClient({
    //   chain,
    //   transport: http(),
    // })
    let latestNonce = await publicClient.getTransactionCount({ address: walletAddress, blockTag: "latest" })
    let pendingNonce = await publicClient.getTransactionCount({ address: walletAddress, blockTag: "pending" })
    if ( pendingNonce> latestNonce) { 
      // todo: send empty transaction
      return { empty: true, nonce: latestNonce }
    }
    // const key = `nonce:${walletAddress}:${chainId}`
    const key = this.keyNonce(walletAddress, chainId)
    if (this.initializedNonces.get(walletAddress + chainId) !== undefined) return
    const seed = pendingNonce - 1
    this.initializedNonces.set(walletAddress + chainId, seed)
    if (this.redisClient) {
      await this.redisClient.SET(key, seed)
    } else {
      this.memoryStorage.set(key, seed)
    }
    return seed
  }

  GetNextNonce = async (walletAddress, chainId) => {
    const key = this.keyNonce(walletAddress.toLowerCase(), chainId)
    if (this.redisClient) {
      return await this.redisClient.incrBy(key, 1)
    } else {
      let prev = this.memoryStorage.get(key)
      if (typeof prev === "undefined") throw new Error("Nonce not initialized")
      const next = prev + 1
      this.memoryStorage.set(key, next)
      return next
    }
  }
  GetCurrentNonce = async (walletAddress, chainId) => {
    const key = this.keyNonce(walletAddress.toLowerCase(), chainId)
    if (this.redisClient) {
      return await this.redisClient.get(key)
    } else {
      return this.memoryStorage.get(key)
    }
  }
  DecreaseNonce = async (walletAddress, chainId) => {
    const key = this.keyNonce(walletAddress.toLowerCase(), chainId)
    if (this.redisClient) {
      return await this.redisClient.decrBy(key, 1)
    } else {
      let currentNonce = this.memoryStorage.get(key)
      if (typeof currentNonce === "undefined") return
      const dec = currentNonce - 1
      this.memoryStorage.set(key, dec)
      return dec
    }
  }


  Send = async (props: { walletClient?: WalletClient; publicClient?: PublicClient<any, any, any>; tx: any; emptyTx?: boolean; chainId: number; tryCount: number; txHash?: string }) => {
    let { walletClient, publicClient, tx, emptyTx, chainId, tryCount, txHash } = props

    if (tryCount > CONFIG.MAX_TRY) return Promise.reject("Transaction Failed More than Max Try")

    CONFIG.log(`Trying nonce: ${tx.nonce}, tryCount ${tryCount}`)

    if (!tx.maxPriorityFeePerGas) {
      tx.maxPriorityFeePerGas = await publicClient.estimateMaxPriorityFeePerGas()
    } else if (tryCount !== 0) {
      /** increase maxPriorityFeePerGas by 15% if retrying */
      CONFIG.log("Increasing maxPriorityFeePerGas by 15%, nonce:", tx.nonce)
      tx.maxPriorityFeePerGas = tx.maxPriorityFeePerGas + (tx.maxPriorityFeePerGas * BigInt(15)) / BigInt(100)
    }
    try {
      if (!txHash) {
        txHash = await walletClient.sendTransaction(tx)
      }
      let res = await publicClient.waitForTransactionReceipt({
        hash: txHash as Hex,
        // confirmations: 1,
        // timeout: 45000,
        // pollingInterval: 1500,
      })
      if (res.status !== "success") {
        /** if reverted */
        return Promise.reject(res)
      }
      if (emptyTx) {
        CONFIG.log("Transaction dropped")
        return Promise.reject("Transaction dropped")
      } else {
        return res
      }
    } catch (error) {
      let walletAddress = walletClient?.account?.address || tx.account?.address
      if (!String(error).includes("Too Many Requests")) {
        tryCount++
      } else {
        CONFIG.log(`RPC Error at nonce: ${tx.nonce}`, String(error))
      }

      await _sleep(1000)
      if (ERRORS.some((errorString) => String(error).includes(errorString))) {
        const currentNonce = await this.GetCurrentNonce(walletAddress, chainId)
        if (tx.nonce === currentNonce) {
          /** if no other transaction in the queue */
          CONFIG.log("Tx Failed, and nonce free", tx.nonce)
          await this.DecreaseNonce(walletAddress, chainId)
          return Promise.reject("Transaction Failed")
        } else {
          CONFIG.log("Tx Dropped at nonce:", tx.nonce)
          /** try zero tx if failed with valid reason */
          tx = { to: tx.to, nonce: tx.nonce, value: 0 }
          return this.Send({ ...props, txHash, tx, emptyTx: true })
        }
      }
      const NONCE_USED_ERROR = ["Try increasing the nonce", "nonce has already been used"]

      if (NONCE_USED_ERROR.some((errorString) => String(error).includes(errorString))) {
        // increase nonce
        let nextNonce
        // const match = String(error).match(/nonce too low: next nonce ([^]*?), tx nonce/)
        // if (match) {
        const key = this.keyNonce(walletAddress.toLowerCase(), chainId)
        // nextNonce = Number(match[1])
        const pending = await publicClient.getTransactionCount({ address: walletAddress, blockTag: "pending" })
        const seed = pending - 1
        if (this.redisClient) {
          await this.redisClient.SET(key, seed)
        } else {
          this.memoryStorage.set(key, seed)
        }
        // }
        nextNonce = await this.GetNextNonce(walletAddress, chainId)

        CONFIG.log(`Current Nonce ${tx.nonce} Retrying With Next nonce`, nextNonce)
        tx.nonce = nextNonce
      }
      // if (!String(error).includes("Too Many Requests")) { // duplicate with above
      //   CONFIG.log(tx.nonce, error)
      // }
      if (String(error).includes("Timed out while waiting for transaction")) {
        /** most probably transaction waiting in the mempool */
        txHash = ""
        //todo: resendWithHigherFee
      }
      return this.Send({ ...props, tx, tryCount, txHash })
    }
  }
  sendTransaction = async ({ walletClient, publicClient, chainId, tx }: { walletClient?: WalletClient; publicClient?: PublicClient<any, any, any>; chainId: number; tx: any }) => {
    let walletAddress = walletClient?.account?.address || tx.account?.address
    if (!walletAddress) throw new Error("Missing Account/wallet")
    const nonZero = await this.InitializeNonce(walletAddress, chainId, publicClient)
    // if (nonZero?.empty) {
    //   console.log("Sending empty transaction to clear pending state")
    //   tx = { to: tx.to, nonce: tx.nonce, value: 0 }
    //   return this.Send({ walletClient, publicClient, tx, chainId, emptyTx: true, tryCount:0 })
    // }
    if (tx.nonce === undefined) {
      tx.nonce = await this.GetNextNonce(walletAddress, chainId)
    }
    return this.Send({ walletClient, publicClient, tx, chainId, tryCount: 0 })
  }
}
const transaction = new Transaction()
export default transaction
