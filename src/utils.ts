export const _sleep = (ms: number) => new Promise((resolve) => setTimeout(() => resolve(true), ms))
export const waitUntil = (cb) =>
  new Promise((resolve) => {
    setInterval(() => {
      if (cb()) resolve(true)
    }, 200)
  })
const TICK_Q = []
let processingTick = null
export const Tick = async (cb) => {
  if (processingTick) {
    await new Promise((resolve) => {
      TICK_Q.push(resolve)
    })
    TICK_Q.shift()
  }
  let p = cb()
  processingTick = p
  let res = await p
  processingTick = undefined
  let nextTick = TICK_Q.at(0)
  if (nextTick) nextTick()
  return res
}
