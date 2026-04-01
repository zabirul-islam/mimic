"use client"
import { useEffect, useRef, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import Image from "next/image"
import Link from "next/link"

type SpotlightEvent = {
  timeMs: number; type: "spotlight"|"laser"
  x: number; y: number; durationMs: number; label?: string
}
type Slide = {
  slideIndex: number; title: string; bullets: string[]
  fullText: string; imageURL: string; script: string
  spotlightEvents: SpotlightEvent[]
}
type Lecture = { lectureId: string; lectureTitle: string; totalSlides: number; slides: Slide[] }
type Msg = { role: "teacher"|"ta"|"student"; text: string }

const AGENTS = [
  { id:"teacher",  emoji:"\u{1F468}\u200D\u{1F3EB}", name:"Prof. AI",  color:"bg-blue-700"  },
  { id:"ta",       emoji:"\u{1F469}\u200D\u{1F4BB}", name:"TA",        color:"bg-teal-700"  },
  { id:"student1", emoji:"\u{1F9D1}\u200D\u{1F393}", name:"Alex",      color:"bg-purple-700"},
  { id:"student2", emoji:"\u{1F469}\u200D\u{1F393}", name:"Mia",       color:"bg-pink-700"  },
]

function SpotlightLayer({ event, w, h }: { event: SpotlightEvent|null; w:number; h:number }) {
  if (!event) return null
  const cx = event.x * w, cy = event.y * h
  if (event.type === "spotlight") {
    const r = Math.min(w,h)*0.12
    return (
      <svg className="absolute inset-0 pointer-events-none" width={w} height={h}>
        <defs>
          <mask id="sm">
            <rect width="100%" height="100%" fill="white"/>
            <circle cx={cx} cy={cy} r={r} fill="black"/>
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#sm)"/>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,210,60,0.8)" strokeWidth={2.5}/>
        {event.label && <text x={cx} y={cy+r+18} textAnchor="middle"
          fill="rgba(255,220,80,1)" fontSize={13} fontWeight={600}>{event.label}</text>}
      </svg>
    )
  }
  return (
    <svg className="absolute inset-0 pointer-events-none" width={w} height={h}>
      <circle cx={cx} cy={cy} r={5}  fill="rgba(255,40,40,0.95)"/>
      <circle cx={cx} cy={cy} r={12} fill="none" stroke="rgba(255,40,40,0.4)" strokeWidth={2}/>
    </svg>
  )
}

export default function ClassroomPage() {
  const { id } = useParams<{ id: string }>()
  const [lecture,   setLecture]  = useState<Lecture|null>(null)
  const [slideIdx,  setSlideIdx] = useState(0)
  const [event,     setEvent]    = useState<SpotlightEvent|null>(null)
  const [agent,     setAgent]    = useState<string|undefined>()
  const [msgs,      setMsgs]     = useState<Msg[]>([])
  const [question,  setQuestion] = useState("")
  const [qaLoading, setQaLoading]= useState(false)
  const [w, setW] = useState(800)
  const [h, setH] = useState(450)
  const [playing,   setPlaying]  = useState(false)
  const slideRef  = useRef<HTMLDivElement>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const msgEnd    = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/medmaic/lecture/${id}`)
      .then(r => r.json()).then(d => setLecture(d.lecture))
  }, [id])

  useEffect(() => {
    if (!slideRef.current) return
    const ro = new ResizeObserver(e => {
      setW(e[0].contentRect.width); setH(e[0].contentRect.height)
    })
    ro.observe(slideRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => { msgEnd.current?.scrollIntoView({ behavior:"smooth" }) }, [msgs])

  const addMsg = (msg: Msg) => setMsgs(p => [...p.slice(-40), msg])
  const clearTimers = () => { timersRef.current.forEach(clearTimeout); timersRef.current = [] }

  const playSlide = useCallback((idx: number, slides: Slide[], lectureId: string) => {
    if (!slides[idx]) return
    const slide = slides[idx]
    clearTimers(); speechSynthesis.cancel()
    setSlideIdx(idx); setEvent(null); setAgent("teacher"); setPlaying(true)

    fetch("/api/medmaic/log", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ type:"slide_start", lectureId, slideIndex:idx, title:slide.title })
    }).catch(()=>{})

    slide.spotlightEvents?.forEach(evt => {
      const t1 = setTimeout(() => {
        setEvent(evt)
        const t2 = setTimeout(() => setEvent(null), evt.durationMs||2000)
        timersRef.current.push(t2)
      }, evt.timeMs)
      timersRef.current.push(t1)
    })

    if (!slide.script) {
      const t = setTimeout(() => {
        setAgent(undefined); setPlaying(false)
        if (idx+1 < slides.length) {
          const t2 = setTimeout(() => playSlide(idx+1, slides, lectureId), 1200)
          timersRef.current.push(t2)
        }
      }, 3000)
      timersRef.current.push(t); return
    }

    addMsg({ role:"teacher", text: slide.script.slice(0,150)+(slide.script.length>150?"...":"") })

    const utt = new SpeechSynthesisUtterance(slide.script)
    utt.rate = 0.88; utt.pitch = 1.0
    const voices = speechSynthesis.getVoices()
    const v = voices.find(v => v.lang.startsWith("en"))||voices[0]
    if (v) utt.voice = v
    utt.onend = () => {
      setAgent(undefined); setPlaying(false)
      if (idx+1 < slides.length) {
        const t = setTimeout(() => playSlide(idx+1, slides, lectureId), 1200)
        timersRef.current.push(t)
      }
    }
    speechSynthesis.speak(utt)
  }, [])

  function startPlayback() {
    if (!lecture) return
    const go = () => playSlide(slideIdx, lecture.slides, lecture.lectureId)
    speechSynthesis.getVoices().length > 0 ? go() : (speechSynthesis.onvoiceschanged = go)
  }

  function stopPlayback() {
    clearTimers(); speechSynthesis.cancel()
    setPlaying(false); setAgent(undefined); setEvent(null)
  }

  async function askQuestion() {
    if (!lecture||!question.trim()) return
    const slide = lecture.slides[slideIdx]
    const q = question.trim(); setQuestion("")
    addMsg({ role:"student", text: q })
    setQaLoading(true); setAgent("ta")
    try {
      const r = await fetch("/api/medmaic/qa", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ question:q, slideTitle:slide.title,
          slideBullets:slide.bullets, slideFullText:slide.fullText })
      })
      const { answer } = await r.json()
      addMsg({ role:"ta", text: answer })
    } finally { setQaLoading(false); setAgent(playing?"teacher":undefined) }
  }

  useEffect(() => () => { clearTimers(); speechSynthesis.cancel() }, [])

  if (!lecture) return (
    <div className="flex items-center justify-center h-screen bg-gray-950 text-white">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"/>
        <p className="text-gray-400 text-sm">Loading lecture...</p>
      </div>
    </div>
  )

  const slide = lecture.slides[slideIdx]

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <aside className="w-48 flex-shrink-0 border-r border-gray-800 flex flex-col">
        <div className="p-3 border-b border-gray-800">
          <Link href="/medmaic" className="text-xs text-blue-400 hover:text-blue-300">← All lectures</Link>
          <p className="text-xs text-gray-500 mt-1 truncate">{lecture.lectureTitle}</p>
          <div className="flex gap-1 mt-2">
            <Link href={`/medmaic/quiz/${id}?type=pre`}
              className="flex-1 text-center py-1 text-[10px] font-semibold rounded
                         bg-yellow-900/40 border border-yellow-700 text-yellow-400
                         hover:bg-yellow-800/40 transition">
              Pre-Quiz
            </Link>
            <Link href={`/medmaic/quiz/${id}?type=post`}
              className="flex-1 text-center py-1 text-[10px] font-semibold rounded
                         bg-green-900/40 border border-green-700 text-green-400
                         hover:bg-green-800/40 transition">
              Post-Quiz
            </Link>
          </div>
          
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {lecture.slides.map((s,i) => (
            <button key={i} onClick={() => { stopPlayback(); setSlideIdx(i) }}
              className={"w-full text-left px-3 py-1.5 text-xs transition truncate " +
                (i===slideIdx ? "bg-blue-900 text-white" : "text-gray-500 hover:bg-gray-800 hover:text-gray-300")}>
              {i+1}. {s.title.slice(0,32)}
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden p-3 gap-2 min-w-0">
        <div ref={slideRef} className="relative flex-1 bg-gray-900 rounded-xl overflow-hidden min-h-0">
          {slide.imageURL ? (
            <Image src={slide.imageURL} alt={slide.title} fill className="object-contain"/>
          ) : (
            <div className="absolute inset-0 flex flex-col justify-center p-8 bg-slate-900">
              <h2 className="text-white text-xl font-semibold mb-3">{slide.title}</h2>
              <ul className="space-y-1.5">
                {slide.bullets.map((b,i) => (
                  <li key={i} className="text-gray-300 text-sm flex gap-2">
                    <span className="text-blue-400">•</span><span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <SpotlightLayer event={event} w={w} h={h}/>
          <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
            {slideIdx+1} / {lecture.totalSlides}
          </div>
        </div>

        <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-900 rounded-xl flex-shrink-0">
          {AGENTS.map(a => (
            <div key={a.id} className={"flex flex-col items-center gap-0.5 transition-all " +
              (agent===a.id ? "scale-110 opacity-100" : "opacity-40")}>
              <div className={"w-8 h-8 rounded-full "+a.color+" flex items-center justify-center text-base " +
                (agent===a.id ? "ring-2 ring-white ring-offset-1 ring-offset-gray-900" : "")}>
                {a.emoji}
              </div>
              <span className="text-[9px] text-gray-400">{a.name}</span>
            </div>
          ))}
          <div className="flex-1"/>
          <button onClick={playing?stopPlayback:startPlayback}
            className={"px-3 py-1 rounded-lg text-xs font-medium transition text-white " +
              (playing?"bg-red-700 hover:bg-red-600":"bg-blue-600 hover:bg-blue-500")}>
            {playing?"⏹ Stop":"▶ Play"}
          </button>
          <button onClick={() => { stopPlayback(); setSlideIdx(i => Math.max(0,i-1)) }}
            className="px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-white">←</button>
          <button onClick={() => { stopPlayback(); setSlideIdx(i => Math.min(lecture.totalSlides-1,i+1)) }}
            className="px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-white">→</button>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <input type="text" value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key==="Enter"&&!e.shiftKey&&askQuestion()}
            placeholder="Ask the AI teacher a question about this slide..."
            disabled={qaLoading}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2
                       text-sm text-white placeholder-gray-500 outline-none
                       focus:border-blue-500 disabled:opacity-50"/>
          <button onClick={askQuestion} disabled={qaLoading||!question.trim()}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm
                       rounded-xl font-medium transition disabled:opacity-40">Ask</button>
        </div>
      </main>

      <aside className="w-56 flex-shrink-0 border-l border-gray-800 flex flex-col">
        <p className="text-xs text-gray-500 px-3 py-2 border-b border-gray-800 uppercase tracking-wider">Chat</p>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {msgs.length===0 && (
            <p className="text-xs text-gray-600 text-center mt-6">Press Play to start</p>
          )}
          {msgs.map((m,i) => (
            <div key={i} className={"flex gap-1.5 items-start "+(m.role==="student"?"flex-row-reverse":"")}>
              <span className="text-sm flex-shrink-0">
                {m.role==="teacher"?"👨\u200D🏫":m.role==="ta"?"👩\u200D💻":"🧑\u200D🎓"}
              </span>
              <div className={"text-xs px-2 py-1.5 rounded-xl max-w-[85%] " +
                (m.role==="student"?"bg-purple-800 text-white rounded-br-none":
                 m.role==="ta"?"bg-teal-900 text-gray-100 rounded-bl-none":
                 "bg-blue-900 text-gray-100 rounded-bl-none")}>
                {m.text}
              </div>
            </div>
          ))}
          <div ref={msgEnd}/>
        </div>
      </aside>
    </div>
  )
}
