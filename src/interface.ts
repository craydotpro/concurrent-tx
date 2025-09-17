import { WalletClient } from "viem"

export interface IViemWallet extends WalletClient {
  address: string
}
export interface ITx {
  to: `0x${string}`
  data?: string
  value?: number
  chainId: number
  gasPrice?: number
  nonce: Number
}
