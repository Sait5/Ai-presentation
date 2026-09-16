import { z } from 'zod'
import { designSchema, themeNames } from './design.js'

export const aiStatusSchema = z.object({ enabled: z.boolean(), provider: z.enum(['gemini', 'openai']), imageGeneration: z.boolean() }).strict()
export type AIStatus = z.infer<typeof aiStatusSchema>

export const presentationRequestSchema = z.object({
  topic: z.string().trim().min(10).max(5000), count: z.number().int().min(3).max(15),
  language: z.enum(['ru', 'en']), tone: z.enum(['Деловой', 'Простой и понятный', 'Академический', 'Вдохновляющий', 'Рекламный']),
  theme: z.enum(themeNames), design: designSchema, imageStyle: z.string().trim().min(1).max(300),
}).strict()
export type PresentationRequest = z.infer<typeof presentationRequestSchema>
export const imageRequestSchema = z.object({ prompt: z.string().trim().min(5).max(1500), style: z.string().trim().min(1).max(300), theme: z.enum(themeNames) }).strict()
export type ImageRequest = z.infer<typeof imageRequestSchema>
export const aiOutlineSchema = z.object({ slides: z.array(z.object({
  title: z.string().max(100), bullets: z.array(z.string().max(110)).min(1).max(3), imagePrompt: z.string().max(1000),
}).strict()).min(3).max(15) }).strict()
