export async function readSse(response: Response, consume: (value: unknown) => void) {
  if (!response.body) throw new Error('Missing stream')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done }).replace(/\r/g, '')
      if (buffer.length > 1_000_000) throw new Error('Stream too large')
      let end: number
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, end); buffer = buffer.slice(end + 2)
        const data = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
        if (data && data !== '[DONE]') consume(JSON.parse(data))
      }
      if (done) break
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
