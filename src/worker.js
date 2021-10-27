export class AmanitaWorker {
  dispatchWork(work) {
    this["on" + work.type](work.data)
  }
}