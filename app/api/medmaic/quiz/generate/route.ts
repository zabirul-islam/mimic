import { NextRequest, NextResponse } from "next/server"
import { getLecture } from "@/lib/medmaic/lectureStore"
import fs from "fs"
import path from "path"

const BASE  = process.env.OPENAI_BASE_URL || "http://localhost:8080/v1"
const MODEL = "checkpoints/alive-llama-lora/merged"

async function callVLLM(system: string, user: string): Promise<string> {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user",   content: user }
      ],
      max_tokens: 1400,
      temperature: 0.3,
    }),
  })
  const d = await r.json()
  return d.choices?.[0]?.message?.content?.trim() ?? ""
}

/**
 * Fix the specific bug where your LLaMA model drops the opening quote
 * on string values, producing:
 *   "question": What was the name...?"
 * instead of:
 *   "question": "What was the name...?"
 *
 * Also fixes unquoted explanation values.
 */
function repairModelJSON(raw: string): string {
  let s = raw

  // Strip markdown fences
  s = s.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim()

  // Extract JSON array
  const first = s.indexOf("[")
  const last  = s.lastIndexOf("]")
  if (first === -1 || last === -1) throw new Error("No JSON array found")
  s = s.slice(first, last + 1)

  // Fix missing OPENING quote on string values after colon
  // Catches: "question": Some text  →  "question": "Some text
  s = s.replace(
    /"(question|explanation|answer|q)"\s*:\s*([^"\[\d\s{\n])/g,
    (_match: string, key: string, firstChar: string) => `"${key}": "${firstChar}`
  )

  // Fix missing CLOSING quote on question value before "options"
  s = s.replace(
    /("question"\s*:\s*"[^"]*?)("\s*\n\s*"options"|\n\s*"options")/g,
    (_m: string, val: string, next: string) => {
      const fixed = val.endsWith('"') ? val : val + '"'
      return fixed + (next.startsWith('"') ? next : '"\n    "options"')
    }
  )

  // Fix missing CLOSING quote on explanation value before end of object }
  s = s.replace(
    /("explanation"\s*:\s*"[^"]*?)(\s*\n\s*\})/g,
    (_m: string, val: string, ending: string) =>
      (val.endsWith('"') ? val : val + '"') + ending
  )

  return s
}


const SYSTEM = `You are a medical imaging professor creating a quiz for undergraduate students.
Given lecture content, generate exactly 5 multiple-choice questions.

Return ONLY a valid JSON array with this exact structure, no other text:
[
  {
    "id": 1,
    "question": "Question text here?",
    "options": ["A) option one", "B) option two", "C) option three", "D) option four"],
    "correct": 0,
    "explanation": "Brief explanation of why A is correct."
  }
]

Rules:
- correct is the 0-based index of the correct option (0=A, 1=B, 2=C, 3=D)
- Mix difficulty: 2 factual recall, 2 conceptual, 1 application
- Questions must be answerable from the provided content only
- Output ONLY the JSON array, nothing else`

export async function POST(req: NextRequest) {
  try {
    const { lectureId } = await req.json()
    const lecture = getLecture(lectureId)
    if (!lecture) return NextResponse.json({ error: "Lecture not found" }, { status: 404 })

    const slides = lecture.slides
    const step = Math.max(1, Math.floor(slides.length / 8))
    const sampled = slides.filter((_, i) => i % step === 0).slice(0, 8)

    const content = sampled
      .map(s => `Slide: ${s.title}\n${s.fullText.slice(0, 300)}`)
      .join("\n\n")

    const user = `Lecture: "${lecture.lectureTitle}"

Content from key slides:
${content}

Generate 5 multiple-choice quiz questions based on this content:`

    const raw = await callVLLM(SYSTEM, user)

    let questions
    try {
      const repaired = repairModelJSON(raw)
      questions = JSON.parse(repaired)

      if (!Array.isArray(questions) || questions.length === 0)
        throw new Error("Empty or invalid array")

      // Normalise each question defensively
      questions = questions.map((q: Record<string, unknown>, i: number) => ({
        id:          i + 1,
        question:    String(q.question ?? `Question ${i + 1}`),
        options:     Array.isArray(q.options)
                       ? (q.options as unknown[]).map(String)
                       : ["A) option 1","B) option 2","C) option 3","D) option 4"],
        correct:     typeof q.correct === "number" ? q.correct : 0,
        explanation: String(q.explanation ?? "See lecture content."),
      }))
    } catch (e) {
      console.error("Quiz parse error:", e, "\nRaw:", raw.slice(0, 400))
      return NextResponse.json(
        { error: `Parse failed: ${e}`, raw: raw.slice(0, 400) },
        { status: 500 }
      )
    }

    const logPath = path.join(process.cwd(), "data", "interaction_log.jsonl")
    fs.appendFileSync(logPath,
      JSON.stringify({
        type: "quiz_generated",
        lectureId,
        timestamp: new Date().toISOString()
      }) + "\n"
    )

    return NextResponse.json({ questions, lectureTitle: lecture.lectureTitle })
  } catch (e) {
    console.error("Quiz generate error:", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
