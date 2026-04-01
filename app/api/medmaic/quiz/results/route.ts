import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

export async function GET() {
  const logPath = path.join(process.cwd(), "data", "interaction_log.jsonl")
  if (!fs.existsSync(logPath)) return NextResponse.json({ results: [] })

  const lines = fs.readFileSync(logPath, "utf-8")
    .split("\n").filter(Boolean)

  const quizResults = lines
    .map(l => { try { return JSON.parse(l) } catch { return null } })
    .filter(e => e?.type === "quiz_result")

  const summary = {
    totalAttempts: quizResults.length,
    preTests:  quizResults.filter(r => r.quizType === "pre"),
    postTests: quizResults.filter(r => r.quizType === "post"),
    byLecture: {} as Record<string, { pre: number[], post: number[] }>
  }

  for (const r of quizResults) {
    if (!summary.byLecture[r.lectureId])
      summary.byLecture[r.lectureId] = { pre: [], post: [] }
    if (r.quizType === "pre")  summary.byLecture[r.lectureId].pre.push(r.score)
    if (r.quizType === "post") summary.byLecture[r.lectureId].post.push(r.score)
  }

  return NextResponse.json({ summary, results: quizResults })
}
