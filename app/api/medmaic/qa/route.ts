import { NextRequest, NextResponse } from "next/server"

const BASE  = process.env.OPENAI_BASE_URL || "http://localhost:8080/v1"
const MODEL = "checkpoints/alive-llama-lora/merged"

async function callVLLM(system: string, user: string) {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user",   content: user }
      ],
      max_tokens: 200,
      temperature: 0.4
    })
  })
  const d = await r.json()
  return d.choices?.[0]?.message?.content?.trim() ?? "I could not generate an answer."
}

export async function POST(req: NextRequest) {
  const { question, slideTitle, slideBullets, slideFullText } = await req.json()
  const answer = await callVLLM(
    `You are a medical imaging teaching assistant helping undergraduate students.
Answer clearly in 2-3 sentences based on the slide content. Never invent clinical facts.`,
    `Slide: "${slideTitle}"
Content: ${(slideBullets as string[]).join(". ")}
Transcript: ${(slideFullText as string).slice(0, 400)}
Student question: ${question}`
  )
  return NextResponse.json({ answer })
}
