import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"

const LOG = path.join(process.cwd(), "data", "interaction_log.jsonl")

export async function POST(req: NextRequest) {
  const { lectureId, answers, questions, quizType } = await req.json()
  // answers: number[] — student's chosen option index per question
  // questions: the same array from /generate

  let correct = 0
  const results = questions.map((q: { correct: number; explanation: string; question: string; options: string[] }, i: number) => {
    const isCorrect = answers[i] === q.correct
    if (isCorrect) correct++
    return {
      questionIndex: i,
      question: q.question,
      studentAnswer: answers[i],
      correctAnswer: q.correct,
      isCorrect,
      explanation: q.explanation,
    }
  })

  const score = Math.round((correct / questions.length) * 100)

  // Log result for paper data
  fs.appendFileSync(LOG, JSON.stringify({
    type: "quiz_result",
    quizType,   // "pre" or "post"
    lectureId,
    score,
    correct,
    total: questions.length,
    results,
    timestamp: new Date().toISOString(),
  }) + "\n")

  return NextResponse.json({ score, correct, total: questions.length, results })
}
