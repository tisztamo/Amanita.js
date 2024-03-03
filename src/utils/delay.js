export function delay(delay_ms, valueOrFunction) {
  return new Promise(function (resolve) {
    setTimeout(() => {
      if (typeof valueOrFunction === "function") {
        resolve(valueOrFunction())
      } else {
        resolve(valueOrFunction)
      }
    }, delay_ms)
  })
}
