class NonceManager {
  redisClient = null
  memoryStorage = new Map()
  SetRedisClient = (r) => {
    this.redisClient = r
  }

  InitNonce = (walletAddress, chainId, nonce) => {
    const key = `nonce:${walletAddress}:${chainId}`
    if (this.redisClient) {
      this.redisClient.SET(key, nonce)
    } else {
      this.memoryStorage.set(key, nonce)
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
}
const nonceManager = new NonceManager()
export default nonceManager
