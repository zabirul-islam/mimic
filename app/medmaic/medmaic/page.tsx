"use client"
import { useEffect, useState } from "react"
import Link from "next/link"

type Meta = { lectureId: string; lectureTitle: string; totalSlides: number }

export default function MedMAICHome() {
  const [lectures, setLectures] = useState<Meta[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    fetch("/api/medmaic/lectures")
      .then(r => r.json())
      .then(d => { setLectures(d.lectures); setLoading(false) })
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-1">MedMAIC</h1>
          <p className="text-gray-400">Medical Imaging AI Classroom — powered by LLaMA 3</p>
        </div>
        {loading && <p className="text-gray-500 text-sm">Loading lectures...</p>}
        <div className="grid gap-3">
          {lectures.map((l, i) => (
            <Link key={l.lectureId}
              href={`/medmaic/classroom/${l.lectureId}`}
              className="flex items-center justify-between p-4 rounded-xl
                         bg-gray-900 border border-gray-800
                         hover:border-blue-600 hover:bg-gray-800 transition group">
              <div className="flex items-center gap-3">
                <span className="text-gray-600 text-sm w-6">{i+1}</span>
                <div>
                  <p className="font-medium group-hover:text-blue-400 transition text-sm">
                    {l.lectureTitle}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{l.totalSlides} slides</p>
                </div>
              </div>
              <span className="text-gray-600 group-hover:text-blue-400 transition">→</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
