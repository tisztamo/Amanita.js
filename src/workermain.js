export default function workerMain() {
  const registry = {}

  function registerWorker(descriptor) {
    const src = "registry[" + descriptor.id + "] = new " + descriptor.workerClassStr + "()"
    eval(src)
  }

  onmessage = function(e) {
    if (e.data.type == "A.regw") {
      registerWorker(e.data.data)
    } else {
      const work = e.data
      registry[work.id]["on" + work.type](work.data)
    }
    }

  postMessage("") // Signal start
}
