// Render only text fields, never JSON syntax, HTML or model reasoning.
const decode = (value: string) => { try { return JSON.parse(`"${value.replace(/\\$/, '')}"`) as string } catch { return '' } }
export function StreamingOutline({ text }: { text: string }) {
  const parts = text.split(/"title"\s*:\s*/).slice(1)
  return <section className="ai-draft" aria-label="Текст появляется по мере генерации"><h3>Gemini пишет…</h3>
    {parts.map((part, i) => {
      const title = part.match(/^"((?:\\.|[^"\\])*)/)
      const body = part.match(/"bullets"\s*:\s*\[([\s\S]*?)(?:\]|$)/)?.[1] ?? ''
      const bullets = [...body.matchAll(/"((?:\\.|[^"\\])*)"?/g)].map(match => decode(match[1]!))
      return <div key={i} className="streaming-slide"><h4>{i + 1}. {decode(title?.[1] ?? '')}</h4><ul>{bullets.map((bullet, j) => <li key={j}>{bullet}</li>)}</ul></div>
    })}
  </section>
}
