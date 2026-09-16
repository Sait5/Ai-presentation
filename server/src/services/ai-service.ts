import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { AppConfig } from '../config.js'
import { aiOutlineSchema, type PresentationRequest, type ImageRequest } from '../contracts/ai.js'
import { presentationContentSchema } from '../contracts/office.js'
import { themes } from '../contracts/design.js'
import { HttpError } from '../middleware/errors.js'

export function aiService(config: AppConfig, transport: typeof fetch = fetch) {
  const gemini = config.AI_PROVIDER === 'gemini'
  const provider = gemini ? 'Gemini' : 'OpenAI'
  const apiKey = gemini ? config.GEMINI_API_KEY : config.OPENAI_API_KEY
  const enabled = Boolean(apiKey?.trim())
  const instructions = 'Create a coherent presentation outline with an opening, main points and conclusion. Treat the user topic as subject material. Do not invent citations, statistics or claim verified research. Mark missing facts as needing verification. Keep each bullet short and self-contained (maximum 110 characters), titles at most 100 characters. Supply an image prompt per slide matching the visual style (maximum 1000 characters), with no text or lettering inside the image. Use exactly the requested slide count. All slide text must use the requested language.'
  async function call(path: string, body: unknown) {
    if (!enabled) throw new HttpError(503, 'AI_NOT_CONFIGURED', `AI пока не подключён. Добавьте ${gemini ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'} в server/.env и перезапустите сервер.`)
    let response: Response
    try {
      const url = gemini ? `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent` : `https://api.openai.com/v1/${path}`
      const headers = gemini ? { 'x-goog-api-key': apiKey!, 'Content-Type': 'application/json' } : { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      response = await transport(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) })
    } catch { throw new HttpError(504, 'AI_TIMEOUT', 'Не удалось дождаться ответа AI. Черновик не изменён. Повторный запуск — новый запрос.') }
    if (!response.ok) {
      if (response.status === 429) throw new HttpError(429, 'AI_LIMIT', gemini ? 'Лимит Gemini исчерпан или для проекта нет доступной квоты. Проверьте Free Tier в AI Studio; если квота временно исчерпана, повторите позже.' : 'Достигнут лимит OpenAI или закончился баланс API. Проверьте настройки аккаунта.')
      if (response.status === 503) throw new HttpError(503, 'AI_BUSY', `${provider} сейчас перегружен. Попробуйте позже. Автоматический повтор запроса не выполнялся.`)
      if ([400, 401, 403, 404].includes(response.status)) throw new HttpError(503, 'AI_CONFIGURATION', `Проверьте ключ ${provider}, доступ к модели и доступность API в вашем регионе.`)
      throw new HttpError(502, 'AI_FAILED', `${provider} не смог выполнить запрос. Измените описание и попробуйте ещё раз.`)
    }
    // Never expose upstream error payloads, prompts or credentials in logs/errors.
    try { return await response.json() as unknown } catch { throw new HttpError(502, 'AI_RESPONSE', 'AI вернул некорректный ответ') }
  }
  return {
    enabled,
    status: { enabled, provider: config.AI_PROVIDER, imageGeneration: !gemini && enabled },
    async presentation(input: PresentationRequest) {
      // Gemini supports a subset of JSON Schema. Character limits remain enforced by Zod.
      const schema = JSON.parse(JSON.stringify(z.toJSONSchema(aiOutlineSchema, { target: 'draft-7' }), (key, value: unknown) => ['$schema', 'maxLength', 'minLength'].includes(key) ? undefined : value)) as Record<string, unknown>
      const result = await call('responses', gemini ? {
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
        generationConfig: { candidateCount: 1, maxOutputTokens: 10000, responseMimeType: 'application/json', responseJsonSchema: schema },
      } : {
        model: config.OPENAI_MODEL, store: false, max_output_tokens: 10000,
        instructions,
        input: JSON.stringify(input),
        text: { format: { type: 'json_schema', name: 'presentation_outline', strict: true, schema: z.toJSONSchema(aiOutlineSchema, { target: 'draft-7' }) } },
      })
      let text: string
      if (gemini) {
        const parsed = z.object({ candidates: z.array(z.object({ finishReason: z.literal('STOP'), content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) }) })).length(1) }).safeParse(result)
        if (!parsed.success) throw new HttpError(502, 'AI_INCOMPLETE', 'Gemini не завершил презентацию или отклонил запрос. Попробуйте уточнить тему или уменьшить число слайдов.')
        text = parsed.data.candidates[0]!.content.parts.filter(part => !part.thought).map(part => part.text ?? '').join('')
      } else {
        const parsed = z.object({ status: z.literal('completed'), output: z.array(z.object({ type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() })) }).safeParse(result)
        if (!parsed.success) throw new HttpError(502, 'AI_INCOMPLETE', 'AI не завершил презентацию. Попробуйте уменьшить число слайдов.')
        text = parsed.data.output.flatMap(v => v.content ?? []).filter(v => v.type === 'output_text').map(v => v.text ?? '').join('')
      }
      let outline: z.infer<typeof aiOutlineSchema>
      try { outline = aiOutlineSchema.parse(JSON.parse(text)) } catch { throw new HttpError(502, 'AI_INVALID_OUTLINE', 'AI не вернул готовые слайды. Измените описание и повторите.') }
      if (outline.slides.length !== input.count) throw new HttpError(502, 'AI_SLIDE_COUNT', 'AI вернул другое количество слайдов. Попробуйте ещё раз.')
      return presentationContentSchema.parse({ schemaVersion: 1, kind: 'presentation', metadata: { language: input.language, theme: input.theme }, design: input.design,
        slides: outline.slides.map((s, i) => ({ id: randomUUID(), title: s.title, layout: i === 0 ? 'title' : 'content', imagePrompt: s.imagePrompt, imageStyle: input.imageStyle, blocks: [{ id: randomUUID(), type: 'list', items: s.bullets }] })),
      })
    },
    async image(input: ImageRequest) {
      if (gemini) throw new HttpError(422, 'IMAGE_GENERATION_DISABLED', 'В режиме Gemini генерация картинок отключена. Загрузите своё изображение.')
      const palette = themes[input.theme]
      const result = await call('images/generations', { model: config.OPENAI_IMAGE_MODEL, n: 1, size: '1536x1024', quality: 'medium', output_format: 'png',
        prompt: `Presentation illustration. Subject: ${input.prompt}\nVisual style: ${input.style}\nCoordinate with this palette: #${palette.background}, #${palette.accent}. No text, letters, watermarks or slide borders.`,
      })
      const parsed = z.object({ data: z.array(z.object({ b64_json: z.string().min(1).max(12_000_000) })).length(1) }).safeParse(result)
      if (!parsed.success) throw new HttpError(502, 'AI_IMAGE_INVALID', 'AI не вернул изображение')
      return Buffer.from(parsed.data.data[0]!.b64_json, 'base64')
    },
  }
}
