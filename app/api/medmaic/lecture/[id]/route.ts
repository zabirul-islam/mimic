import { NextRequest, NextResponse } from "next/server"
import { getLecture } from "@/lib/medmaic/lectureStore"

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const lecture = getLecture(id)
  if (!lecture) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ lecture })
}
