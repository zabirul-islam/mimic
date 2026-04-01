import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"

const LOG = path.join(process.cwd(), "data", "interaction_log.jsonl")

export async function POST(req: NextRequest) {
  const entry = await req.json()
  fs.appendFileSync(LOG, JSON.stringify({
    ...entry, timestamp: new Date().toISOString()
  }) + "\n")
  return NextResponse.json({ ok: true })
}
