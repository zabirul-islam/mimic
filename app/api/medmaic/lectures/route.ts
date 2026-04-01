import { NextResponse } from "next/server"
import { getLectureList } from "@/lib/medmaic/lectureStore"

export async function GET() {
  try {
    return NextResponse.json({ lectures: getLectureList() })
  } catch (e) {
    return NextResponse.json({ error: "Could not load lectures" }, { status: 500 })
  }
}
