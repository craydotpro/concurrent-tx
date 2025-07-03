import { WalletClient } from "viem"
import { Wallet } from "ethers"

export interface IViemWallet extends WalletClient {
  address: string
}
export interface IEtherWallet extends Wallet {
  sendTransactionWithRetry: Function
}
export interface ITx {
  to: `0x${string}`
  data?: string
  value?: number
  chainId: number
  gasPrice?: number
  nonce: Number
}
