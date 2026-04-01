"""
server.py — MIMIC OpenClaw Skill Server
with RAG retrieval + per-user chat history

Architecture:
  Telegram → OpenClaw → SKILL.md → this server → MIMIC-LM
                                      ↑
                                 RAG retriever (FAISS)
                                 chat history (in-memory)
"""

from flask import Flask, request, jsonify
import requests, json, re, logging
from pathlib import Path
from datetime import datetime
from collections import deque

# ── RAG retriever (optional — degrades gracefully if index missing) ──
try:
    import rag_retriever
    RAG_AVAILABLE = True
    logging.info("RAG retriever imported successfully")
except ImportError:
    RAG_AVAILABLE = False
    logging.warning("rag_retriever.py not found — RAG disabled")

logging.basicConfig(level=logging.INFO, format='%(asctime)s [MIMIC] %(message)s')
app = Flask(__name__)

# ── Config ────────────────────────────────────────────────────
MIMIC_BASE  = "http://localhost:3000"
VLLM_BASE   = "http://localhost:8080/v1"
VLLM_MODEL  = "checkpoints/alive-llama-lora/merged"
DATA_DIR    = Path("data/lectures")

# Chat history: keep last N turns per user
HISTORY_MAX_TURNS = 6   # 3 user + 3 assistant turns
# {user_id: deque([{"role": ..., "content": ...}, ...])}
chat_histories: dict[str, deque] = {}


# ── Data helpers ──────────────────────────────────────────────

def get_lecture_list():
    result = []
    for f in sorted(DATA_DIR.glob("*.json")):
        d = json.loads(f.read_text())
        result.append({
            "id": d["lectureId"],
            "title": d["lectureTitle"],
            "slides": d["totalSlides"]
        })
    return result


def get_lecture(lid):
    p = DATA_DIR / f"{lid}.json"
    return json.loads(p.read_text()) if p.exists() else None


def find_lecture(query):
    m = re.search(r'(?:lecture|lec|l)[\s#_-]*(\d+)', query.lower())
    if m:
        lec = get_lecture(f"Lecture_{int(m.group(1)):02d}")
        if lec:
            return lec
    words = [w for w in query.lower().split() if len(w) > 3]
    for lm in get_lecture_list():
        if any(w in lm["title"].lower() for w in words):
            return get_lecture(lm["id"])
    return None


# ── Chat history helpers ──────────────────────────────────────

def get_history(user_id: str) -> deque:
    if user_id not in chat_histories:
        chat_histories[user_id] = deque(maxlen=HISTORY_MAX_TURNS * 2)
    return chat_histories[user_id]


def add_to_history(user_id: str, role: str, content: str):
    hist = get_history(user_id)
    hist.append({"role": role, "content": content})


def format_history_for_llm(user_id: str) -> list[dict]:
    """Return chat history as list of {role, content} dicts for vLLM."""
    return list(get_history(user_id))


def clear_history(user_id: str):
    if user_id in chat_histories:
        del chat_histories[user_id]


# ── LLM helpers ───────────────────────────────────────────────

def call_llm(system: str, user: str, history: list[dict] = None,
             max_tokens: int = 300, temperature: float = 0.0) -> str:
    """Call MIMIC-LM with optional chat history."""
    messages = [{"role": "system", "content": system}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user})

    r = requests.post(f"{VLLM_BASE}/chat/completions", json={
        "model": VLLM_MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }, timeout=30)
    return r.json()["choices"][0]["message"]["content"].strip()


def classify_intent(text: str) -> str:
    """Use MIMIC-LM to classify student intent."""
    system = """You are a routing assistant for MIMIC, a medical imaging AI classroom.
Classify the student message into EXACTLY one of these intents:
- CLASSROOM: student wants to open, start, view, or attend a lecture
- QUIZ: student wants to be tested, quizzed, or practice questions
- SUMMARY: student wants a summary, overview, or outline of a lecture
- LIST: student wants to see all available lectures
- ASK: student has a medical imaging question they want answered
- HELP: greeting, unclear, or off-topic

Reply with ONLY the intent word, nothing else."""
    try:
        intent = call_llm(system, text, max_tokens=10).upper().strip()
        for i in ["CLASSROOM", "QUIZ", "SUMMARY", "LIST", "ASK", "HELP"]:
            if i in intent:
                return i
    except Exception:
        pass
    return "HELP"


def answer_question_with_rag(text: str, user_id: str) -> tuple[str, str]:
    """
    Answer a question using RAG retrieval + MIMIC-LM + chat history.

    Returns (answer, source_label)
    """
    # Step 1: RAG retrieval
    if RAG_AVAILABLE and rag_retriever.is_available():
        context, source = rag_retriever.get_context(text, top_k=4, max_chars=1200)
        retrieval_method = "RAG (FAISS cosine similarity)"
        logging.info(f"RAG context retrieved from: {source[:80]}")
    else:
        # Fallback: use JSON lecture data
        context, source = _fallback_context(text)
        retrieval_method = "JSON slide lookup"
        logging.info(f"RAG unavailable — using fallback context from: {source}")

    # Step 2: Get chat history for this user
    history = format_history_for_llm(user_id)

    # Step 3: Build system prompt
    system = (
        "You are MIMIC-LM, a medical imaging teaching assistant fine-tuned on "
        "RPI BMED 6530 lecture slides. "
        "Answer the student's question in 2-3 clear, precise sentences. "
        "Base your answer only on the provided lecture context. "
        "If the context does not contain the answer, say so honestly. "
        "Do not add hedging preambles — go straight to the answer."
    )

    # Step 4: Build user message with context
    user_msg = f"Lecture context:\n{context}\n\nQuestion: {text}"

    # Step 5: Call MIMIC-LM
    try:
        answer = call_llm(system, user_msg, history=history,
                          max_tokens=150, temperature=0.0)
    except Exception as e:
        logging.warning(f"MIMIC-LM call failed: {e}")
        answer = "MIMIC-LM is currently offline. Please try again in a moment."

    # Step 6: Update chat history
    add_to_history(user_id, "user", text)
    add_to_history(user_id, "assistant", answer)

    return answer, source


def _fallback_context(text: str) -> tuple[str, str]:
    """Fallback when RAG index is not available — search JSON slide data."""
    words = [w for w in text.lower().split() if len(w) > 4]
    lec = find_lecture(text)
    if lec:
        ctx = " ".join(s.get("fullText", "") for s in lec["slides"][:6])[:800]
        return ctx, lec["lectureTitle"]
    for lf in sorted(DATA_DIR.glob("*.json")):
        d = json.loads(lf.read_text())
        combined = " ".join(s.get("fullText", "") for s in d["slides"][:5])
        if any(w in combined.lower() for w in words):
            return combined[:800], d["lectureTitle"]
    return "Medical imaging covers X-ray, CT, MRI, PET/SPECT, and ultrasound.", "Medical Imaging"


def generate_summary(lec: dict) -> str:
    """Generate LLM summary of a lecture."""
    slides = lec["slides"]
    step   = max(1, len(slides) // 6)
    context = " ".join(
        f"Slide {s.get('slideNumber','')}: {s.get('title','')}. {s.get('fullText','')[:200]}"
        for s in slides[::step]
    )[:1500]
    return call_llm(
        "You are MIMIC-LM, a medical imaging teaching assistant. "
        "Write a clear 3-4 sentence summary of this lecture for a student. "
        "State the main topics and what the student will learn.",
        f"Lecture: {lec['lectureTitle']}\n\nContent:\n{context}",
        max_tokens=200,
    )


def generate_quiz(lid: str, n: int = 3) -> list[dict]:
    """Generate n quiz questions from lecture slides."""
    lec = get_lecture(lid)
    if not lec:
        return []
    slides = lec["slides"]
    step   = max(1, len(slides) // n)
    qs     = []
    for i in range(n):
        slide = slides[i * step]
        ctx   = f"Title: {slide['title']}\n{slide['fullText'][:400]}"
        raw   = call_llm(
            'Generate ONE multiple choice question. '
            'Return ONLY valid JSON: {"q":"...","options":["A)...","B)...","C)...","D)..."],"correct":0}',
            f"Slide:\n{ctx}\n\nGenerate one MCQ:",
            max_tokens=200,
            temperature=0.4,
        )
        raw = re.sub(r'"(q|options|correct)"\s*:\s*([^"\[\d\s{])',
                     lambda m: f'"{m.group(1)}": "{m.group(2)}"', raw)
        try:
            obj = json.loads(raw[raw.find("{"):raw.rfind("}")+1])
            qs.append(obj)
        except Exception as e:
            logging.warning(f"Quiz parse error: {e} | raw: {raw[:100]}")
    return qs


def log_it(platform: str, user: str, intent: str, lid: str = None):
    with open("data/interaction_log.jsonl", "a") as f:
        f.write(json.dumps({
            "type":      "openclaw",
            "platform":  platform,
            "user":      user,
            "intent":    intent,
            "lectureId": lid,
            "rag_used":  RAG_AVAILABLE and rag_retriever.is_available() if RAG_AVAILABLE else False,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }) + "\n")


# ── Routes ────────────────────────────────────────────────────

@app.route("/health")
def health():
    return jsonify({
        "status":  "ok",
        "system":  "MIMIC OpenClaw Skill",
        "rag":     RAG_AVAILABLE and rag_retriever.is_available() if RAG_AVAILABLE else False,
        "history": len(chat_histories),
    })


@app.route("/history/clear", methods=["POST"])
def clear_history_route():
    """Clear chat history for a user. POST {"user": "user_id"}"""
    data    = request.get_json(force=True)
    user_id = data.get("user", "student")
    clear_history(user_id)
    return jsonify({"status": "ok", "message": f"History cleared for {user_id}"})


@app.route("/webhook", methods=["POST"])
def webhook():
    data     = request.get_json(force=True)
    text     = data.get("text", "").strip()
    user     = data.get("user", "student")
    platform = data.get("platform", "unknown")

    if not text:
        return jsonify({"type": "text", "text": "Please send a message."})

    logging.info(f"[{platform}] {user}: {text[:80]}")

    # Clear history command
    if text.lower().strip() in ["/clear", "/reset", "clear history", "reset chat"]:
        clear_history(user)
        return jsonify({"type": "text", "text": "Chat history cleared. Starting fresh!"})

    # Step 1: Classify intent using MIMIC-LM
    intent = classify_intent(text)
    logging.info(f"Intent: {intent}")

    # Step 2: Route

    if intent == "LIST":
        log_it(platform, user, "list")
        lectures = get_lecture_list()
        listing  = "\n".join(f"  {i+1:2d}. {l['title']} ({l['slides']} slides)"
                             for i, l in enumerate(lectures))
        return jsonify({"type": "text", "text":
            "MIMIC - All 23 Medical Imaging Lectures\n"
            "(LLaMA 3.1-8B fine-tuned on RPI BMED 6530)\n\n"
            f"{listing}\n\n"
            "Try: Teach me Lecture 5  or  Quiz me on Lecture 3"})

    if intent == "CLASSROOM":
        lec = find_lecture(text)
        if lec:
            url = f"{MIMIC_BASE}/medmaic/classroom/{lec['lectureId']}"
            log_it(platform, user, "classroom", lec["lectureId"])
            return jsonify({"type": "classroom", "text":
                f"Lecture: {lec['lectureTitle']}\n"
                f"{lec['totalSlides']} slides - AI narration - Real-time Q&A\n"
                f"Powered by MIMIC-LM (LLaMA 3.1-8B, domain-adapted)\n\n"
                f"Open classroom:\n{url}\n\n"
                f"Pre-quiz:\n{MIMIC_BASE}/medmaic/quiz/{lec['lectureId']}?type=pre"})
        lectures = get_lecture_list()
        listing  = "\n".join(f"  {i+1}. {l['title']}"
                             for i, l in enumerate(lectures[:8]))
        return jsonify({"type": "text", "text":
            f"Which lecture would you like?\n\n{listing}\n  ...\n\n"
            "Say: Teach me Lecture 3  or  Open Lecture 7"})

    if intent == "QUIZ":
        lec = find_lecture(text)
        if not lec:
            return jsonify({"type": "text", "text":
                "Which lecture should I quiz you on?\n"
                "Example: Quiz me on Lecture 5"})
        qs = generate_quiz(lec["lectureId"])
        log_it(platform, user, "quiz", lec["lectureId"])
        if not qs:
            return jsonify({"type": "text", "text": "Could not generate quiz. Try again."})
        fmt = f"Quick Quiz - {lec['lectureTitle']}\n\n"
        for i, q in enumerate(qs):
            fmt += f"Q{i+1}. {q.get('q', '')}\n"
            for opt in q.get("options", []):
                fmt += f"   {opt}\n"
            fmt += "\n"
        fmt += f"Full quiz:\n{MIMIC_BASE}/medmaic/quiz/{lec['lectureId']}?type=post"
        return jsonify({"type": "quiz", "text": fmt})

    if intent == "SUMMARY":
        lec = find_lecture(text)
        if not lec:
            return jsonify({"type": "text", "text":
                "Which lecture? Example: Summary of Lecture 7"})
        try:
            summary = generate_summary(lec)
        except Exception:
            summary = "Summary unavailable - model offline."
        log_it(platform, user, "summary", lec["lectureId"])
        return jsonify({"type": "text", "text":
            f"Lecture Summary: {lec['lectureTitle']} ({lec['totalSlides']} slides)\n\n"
            f"{summary}\n\n"
            f"Open classroom:\n{MIMIC_BASE}/medmaic/classroom/{lec['lectureId']}"})

    if intent == "ASK":
        log_it(platform, user, "ask")
        answer, source = answer_question_with_rag(text, user)
        rag_tag = " (RAG)" if (RAG_AVAILABLE and rag_retriever.is_available()) else ""
        return jsonify({"type": "answer", "text":
            f"MIMIC-LM{rag_tag} (source: {source})\n\n{answer}"})

    # HELP / fallback
    log_it(platform, user, "help")
    clear_history(user)  # reset history on new session start
    return jsonify({"type": "text", "text":
        "Welcome to MIMIC - Medical Imaging AI Classroom!\n"
        "LLaMA 3.1-8B fine-tuned on RPI BMED 6530 (23 lectures)\n\n"
        "You can say anything naturally:\n"
        "- Teach me Lecture 3\n"
        "- Quiz me on Lecture 5\n"
        "- Summary of Lecture 7\n"
        "- What is a Hounsfield unit?\n"
        "- Show all lectures\n\n"
        "Type /clear to reset chat history."})


if __name__ == "__main__":
    print("=" * 50)
    print("  MIMIC OpenClaw Skill Server")
    print("  http://localhost:8090/webhook")
    print(f"  RAG: {'enabled' if RAG_AVAILABLE else 'disabled (install sentence-transformers + faiss)'}")
    print("  Chat history: enabled (per user, last 6 turns)")
    print("=" * 50)
    app.run(host="0.0.0.0", port=8090, debug=False)
