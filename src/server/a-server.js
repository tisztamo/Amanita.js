import { serve } from "https://deno.land/std@0.106.0/http/server.ts"
import {
  acceptWebSocket,
  isWebSocketCloseEvent,
  isWebSocketPingEvent,
} from "https://deno.land/std@0.106.0/ws/mod.ts"

import {deliver, setWorkerSrcHandler, setWorkerRegistrationHandler} from "../scheduler.js"
import {_sendMsg} from "../workerutils.js"

setWorkerSrcHandler(workerSrc => {
  const allowedPrefix = new URL(location.href)
  allowedPrefix.pathname = ""
  allowedPrefix.hash = ""
  if (workerSrc.startsWith(allowedPrefix.href)) {
    const realSrc = new URL("./" + workerSrc.substr(allowedPrefix.href.length), `file://${Deno.cwd()}/`).href
    console.log(`Origin: ${allowedPrefix.href}, worker src: ${workerSrc}, loading worker from ${realSrc}`)
    return realSrc
  } else {
    console.error(`External imports are not supported. Origin: ${allowedPrefix.href}, worker src: ${workerSrc}`)
  }
  return  false
})

setWorkerRegistrationHandler((worker, conn) => {

})

async function handleWs(sock) {
  console.log("socket connected!")
  _sendMsg(sock, -1, "A.wrks") // Signal start
  try {
    for await (const ev of sock) {
      if (typeof ev === "string") {
        // console.log("in :", ev)
        const work = JSON.parse(ev)
        deliver(work, sock)
      } else if (ev instanceof Uint8Array) {
        console.log("dropping ws:Binary", ev)
      } else if (isWebSocketPingEvent(ev)) {
        const [, body] = ev
        console.log("ws:Ping", body)
      } else if (isWebSocketCloseEvent(ev)) {
        //cleanUp(sock)
        const { code, reason } = ev
        console.log("ws:Close", code, reason)
      }
    }
  } catch (err) {
    console.error(`Failed to receive frame. Closing socket.`, err)

    if (!sock.isClosed) {
      await sock.close(1000).catch(console.error)
    }
  }
}

if (import.meta.main) {
  const port = Deno.args[0] || "2626"
  console.log(`websocket server is running on :${port}`)
  for await (const req of serve(`:${port}`)) {
    const { conn, r: bufReader, w: bufWriter, headers } = req
    acceptWebSocket({
      conn,
      bufReader,
      bufWriter,
      headers,
    })
      .then(handleWs)
      .catch(async (err) => {
        console.error(`failed to accept websocket: ${err}`)
        await req.respond({ status: 400 })
      })
  }
}
