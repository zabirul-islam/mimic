"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"

type Question = {
  id: number
  question: string
  options: string[]
  correct: number
  explanation: string
}

type Result = {
  questionIndex: number
  question: string
  studentAnswer: number
  correctAnswer: number
  isCorrect: boolean
  explanation: string
}

type Phase = "loading" | "ready" | "taking" | "submitting" | "results"

export default function QuizPage() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const quizType = searchParams.get("type") ?? "post"  // "pre" or "post"

  const [phase,     setPhase]     = useState<Phase>("loading")
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers,   setAnswers]   = useState<(number | null)[]>([])
  const [current,  setCurrent]    = useState(0)
  const [results,  setResults]    = useState<Result[]>([])
  const [score,    setScore]      = useState(0)
  const [correct,  setCorrect]    = useState(0)
  const [lectureTitle, setLectureTitle] = useState("")
  const [error,    setError]      = useState("")
  const [timeLeft, setTimeLeft]   = useState(0)
  const [timerActive, setTimerActive] = useState(false)

  // Generate quiz on mount
  useEffect(() => {
    fetch("/api/medmaic/quiz/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lectureId: id })
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setPhase("ready"); return }
        setQuestions(d.questions)
        setAnswers(new Array(d.questions.length).fill(null))
        setLectureTitle(d.lectureTitle)
        setPhase("ready")
      })
      .catch(e => { setError(String(e)); setPhase("ready") })
  }, [id])

  // Timer
  useEffect(() => {
    if (!timerActive || timeLeft <= 0) return
    const t = setInterval(() => {
      setTimeLeft(p => {
        if (p <= 1) { clearInterval(t); handleSubmit(); return 0 }
        return p - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [timerActive, timeLeft])

  function startQuiz() {
    setPhase("taking")
    setCurrent(0)
    setTimeLeft(questions.length * 90)  // 90s per question
    setTimerActive(true)
  }

  function selectAnswer(idx: number) {
    setAnswers(prev => {
      const next = [...prev]
      next[current] = idx
      return next
    })
  }

  function nextQuestion() {
    if (current < questions.length - 1) setCurrent(c => c + 1)
  }
  function prevQuestion() {
    if (current > 0) setCurrent(c => c - 1)
  }

  async function handleSubmit() {
    setTimerActive(false)
    setPhase("submitting")
    const finalAnswers = answers.map(a => a ?? 0)
    const r = await fetch("/api/medmaic/quiz/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lectureId: id,
        answers: finalAnswers,
        questions,
        quizType,
      })
    })
    const d = await r.json()
    setResults(d.results)
    setScore(d.score)
    setCorrect(d.correct)
    setPhase("results")
  }

  const allAnswered = answers.every(a => a !== null)
  const mins = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60

  // ── Loading ──────────────────────────────────
  if (phase === "loading") return (
    <div className="flex items-center justify-center h-screen bg-gray-950 text-white">
      <div className="text-center">
        <div className="animate-spin w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"/>
        <p className="text-gray-400">Generating quiz from lecture content...</p>
        <p className="text-gray-600 text-xs mt-2">Your LLaMA 3 model is creating questions</p>
      </div>
    </div>
  )

  // ── Error ────────────────────────────────────
  if (phase === "ready" && error) return (
    <div className="flex items-center justify-center h-screen bg-gray-950 text-white">
      <div className="text-center max-w-md">
        <p className="text-red-400 text-lg mb-2">Failed to generate quiz</p>
        <p className="text-gray-500 text-sm mb-4">{error}</p>
        <Link href={`/medmaic/classroom/${id}`}
          className="px-4 py-2 bg-blue-600 rounded-lg text-sm hover:bg-blue-500 transition">
          ← Back to lecture
        </Link>
      </div>
    </div>
  )

  // ── Ready screen ─────────────────────────────
  if (phase === "ready") return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-lg w-full bg-gray-900 rounded-2xl p-8 border border-gray-800">
        <div className="text-center mb-6">
          <span className="text-4xl mb-3 block">📝</span>
          <h1 className="text-2xl font-bold mb-1">
            {quizType === "pre" ? "Pre-Lecture Quiz" : "Post-Lecture Quiz"}
          </h1>
          <p className="text-gray-400 text-sm">{lectureTitle}</p>
        </div>
        <div className="space-y-3 mb-8 text-sm text-gray-300">
          <div className="flex justify-between border-b border-gray-800 pb-2">
            <span className="text-gray-500">Questions</span>
            <span className="font-medium">{questions.length} multiple choice</span>
          </div>
          <div className="flex justify-between border-b border-gray-800 pb-2">
            <span className="text-gray-500">Time limit</span>
            <span className="font-medium">{questions.length * 90 / 60} minutes</span>
          </div>
          <div className="flex justify-between border-b border-gray-800 pb-2">
            <span className="text-gray-500">Passing score</span>
            <span className="font-medium">60%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Quiz type</span>
            <span className={`font-medium ${quizType === "pre" ? "text-yellow-400" : "text-green-400"}`}>
              {quizType === "pre" ? "Pre-lecture assessment" : "Post-lecture assessment"}
            </span>
          </div>
        </div>
        <button onClick={startQuiz}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold transition">
          Start Quiz
        </button>
        <Link href={`/medmaic/classroom/${id}`}
          className="block text-center text-gray-500 text-sm mt-3 hover:text-gray-400 transition">
          ← Back to lecture
        </Link>
      </div>
    </div>
  )

  // ── Taking quiz ──────────────────────────────
  if (phase === "taking") {
    const q = questions[current]
    const answered = answers[current]
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800">
          <span className="text-sm text-gray-400 truncate max-w-xs">{lectureTitle}</span>
          <div className={`font-mono text-sm font-semibold px-3 py-1 rounded-lg
            ${timeLeft < 60 ? "bg-red-900 text-red-300" : "bg-gray-800 text-gray-300"}`}>
            {String(mins).padStart(2,"0")}:{String(secs).padStart(2,"0")}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-800">
          <div className="h-1 bg-blue-600 transition-all"
            style={{ width: `${((current + 1) / questions.length) * 100}%` }}/>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-2xl w-full">

            {/* Question counter + dots */}
            <div className="flex items-center gap-2 mb-6">
              {questions.map((_, i) => (
                <button key={i} onClick={() => setCurrent(i)}
                  className={`w-8 h-8 rounded-full text-xs font-semibold transition
                    ${i === current ? "bg-blue-600 text-white" :
                      answers[i] !== null ? "bg-green-700 text-white" :
                      "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
                  {i + 1}
                </button>
              ))}
            </div>

            {/* Question */}
            <div className="bg-gray-900 rounded-2xl p-6 mb-4 border border-gray-800">
              <p className="text-xs text-blue-400 font-semibold uppercase tracking-wider mb-2">
                Question {current + 1} of {questions.length}
              </p>
              <p className="text-lg font-medium leading-relaxed">{q.question}</p>
            </div>

            {/* Options */}
            <div className="space-y-3 mb-6">
              {q.options.map((opt, i) => (
                <button key={i} onClick={() => selectAnswer(i)}
                  className={`w-full text-left px-5 py-4 rounded-xl border transition
                    ${answered === i
                      ? "border-blue-500 bg-blue-900/40 text-white"
                      : "border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-500 hover:bg-gray-800"}`}>
                  <span className={`inline-block w-7 h-7 rounded-full text-xs font-bold
                    mr-3 text-center leading-7 flex-shrink-0
                    ${answered === i ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}
                    style={{display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
                    {["A","B","C","D"][i]}
                  </span>
                  {opt.replace(/^[ABCD]\)\s*/,"")}
                </button>
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button onClick={prevQuestion} disabled={current === 0}
                className="px-4 py-2 bg-gray-800 rounded-lg text-sm disabled:opacity-30 hover:bg-gray-700 transition">
                ← Previous
              </button>

              <span className="text-xs text-gray-500">
                {answers.filter(a => a !== null).length} / {questions.length} answered
              </span>

              {current < questions.length - 1 ? (
                <button onClick={nextQuestion}
                  className="px-4 py-2 bg-blue-600 rounded-lg text-sm hover:bg-blue-500 transition">
                  Next →
                </button>
              ) : (
                <button onClick={handleSubmit} disabled={!allAnswered}
                  className="px-5 py-2 bg-green-600 rounded-lg text-sm font-semibold
                             hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed transition">
                  Submit Quiz ✓
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Submitting ───────────────────────────────
  if (phase === "submitting") return (
    <div className="flex items-center justify-center h-screen bg-gray-950 text-white">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full mx-auto mb-3"/>
        <p className="text-gray-400">Grading your answers...</p>
      </div>
    </div>
  )

  // ── Results ──────────────────────────────────
  const passed = score >= 60
  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-2xl mx-auto">

        {/* Score card */}
        <div className={`rounded-2xl p-8 text-center mb-6 border
          ${passed ? "bg-green-900/20 border-green-700" : "bg-red-900/20 border-red-700"}`}>
          <div className="text-6xl font-bold mb-1">{score}%</div>
          <div className={`text-lg font-semibold mb-1 ${passed ? "text-green-400" : "text-red-400"}`}>
            {passed ? "Passed ✓" : "Needs Review"}
          </div>
          <div className="text-gray-400 text-sm">
            {correct} out of {questions.length} correct
          </div>
          <div className="text-gray-500 text-xs mt-1">
            {quizType === "pre" ? "Pre-lecture" : "Post-lecture"} assessment — {lectureTitle}
          </div>
        </div>

        {/* Per-question breakdown */}
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Question Review
        </h2>
        <div className="space-y-3 mb-6">
          {results.map((r, i) => (
            <div key={i} className={`rounded-xl p-4 border
              ${r.isCorrect ? "bg-green-900/10 border-green-800" : "bg-red-900/10 border-red-800"}`}>
              <div className="flex items-start gap-3">
                <span className={`text-lg flex-shrink-0 mt-0.5
                  ${r.isCorrect ? "text-green-400" : "text-red-400"}`}>
                  {r.isCorrect ? "✓" : "✗"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium mb-1">{r.question}</p>
                  {!r.isCorrect && (
                    <p className="text-xs text-gray-400 mb-1">
                      Your answer: <span className="text-red-400">
                        {questions[i]?.options[r.studentAnswer]?.replace(/^[ABCD]\)\s*/,"") ?? "—"}
                      </span>
                    </p>
                  )}
                  <p className="text-xs text-gray-400">
                    Correct: <span className="text-green-400">
                      {questions[i]?.options[r.correctAnswer]?.replace(/^[ABCD]\)\s*/,"") ?? "—"}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 mt-2 italic">{r.explanation}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Link href={`/medmaic/classroom/${id}`}
            className="flex-1 py-3 text-center bg-blue-600 hover:bg-blue-500
                       rounded-xl font-medium transition text-sm">
            Back to Lecture
          </Link>
          <Link href="/medmaic"
            className="px-4 py-3 text-center bg-gray-800 hover:bg-gray-700
                       rounded-xl font-medium transition text-sm">
            All Lectures
          </Link>
        </div>
      </div>
    </div>
  )
}
