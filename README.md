# MIMIC: Medical Imaging Multi-Agent Interactive Classroom

A domain-adapted AI classroom platform for medical imaging education, built on top of [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC).

**Paper:** MIMIC: Medical Imaging Multi-Agent Interactive Classroom — Md Zabirul Islam, Ge Wang, Rensselaer Polytechnic Institute  
**Dataset:** https://huggingface.co/datasets/zabir1996/mimic-medical-imaging-qa

---

## What this repository contains

This repository contains only the MIMIC-specific contributions added on top of OpenMAIC:
```
app/api/medmaic/     ← Quiz generation, lecture API, Q&A endpoints
app/medmaic/         ← Classroom and quiz front-end pages  
skills/mimic/        ← Telegram/OpenClaw skill server
  ├── server.py      ← Flask webhook with LLM-first intent routing
  ├── rag_retriever.py ← FAISS-based course-specific RAG retriever
  ├── telegram_bot.py  ← Direct Telegram bot (alternative to OpenClaw)
  └── SKILL.md       ← OpenClaw skill descriptor
data/lectures/       ← 23 structured medical imaging lecture JSON files
tts_server.py        ← Text-to-speech server for AI narration
```

The base classroom framework is [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) by THU-MAIC. You must install OpenMAIC first.

---

## Prerequisites

- Python 3.12 (conda recommended)
- Node.js 22+ (via nvm)
- NVIDIA GPU with 80GB+ VRAM for vLLM
- Conda environment named `medmaic`

---

## Step 1 — Install OpenMAIC
```bash
git clone https://github.com/THU-MAIC/OpenMAIC.git
cd OpenMAIC
nvm install 22 && nvm use 22
npm install -g pnpm
pnpm install
```

---

## Step 2 — Add MIMIC files
```bash
# Clone MIMIC contributions
git clone https://github.com/zabirul-islam/mimic.git mimic-files

# Copy into your OpenMAIC directory
cp -r mimic-files/app/api/medmaic   OpenMAIC/app/api/medmaic
cp -r mimic-files/app/medmaic       OpenMAIC/app/medmaic
cp -r mimic-files/skills/mimic      OpenMAIC/skills/mimic
cp -r mimic-files/data/lectures     OpenMAIC/data/lectures
cp    mimic-files/tts_server.py     OpenMAIC/
cp    mimic-files/rag_retriever.py  OpenMAIC/
```

---

## Step 3 — Install Python dependencies
```bash
conda create -n medmaic python=3.12
conda activate medmaic
pip install flask requests python-telegram-bot sentence-transformers faiss-cpu
```

---

## Step 4 — Prepare your lecture data

Your lectures must be structured as JSON files in `data/lectures/`. Each file corresponds to one lecture with the format:
```json
{
  "lectureId": "Lecture_01",
  "lectureTitle": "Medical Imaging — Lecture 01",
  "totalSlides": 50,
  "slides": [
    {
      "slideNumber": 1,
      "title": "Introduction",
      "fullText": "...",
      "imageUrl": "..."
    }
  ]
}
```

To adapt MIMIC to your own course:
1. Organize your slides as JPEG images and transcripts as `.txt` files
2. Run the ingestion pipeline to generate JSON files (see `scripts/`)
3. Place the JSON files in `data/lectures/`

The 23 medical imaging lectures used in the paper are available at:  
https://huggingface.co/datasets/zabir1996/mip-bench/tree/main/Lectures

---

## Step 5 — Fine-tune MIMIC-LM (optional)

To train your own domain-adapted model:
```bash
# Download the QA dataset
# https://huggingface.co/datasets/zabir1996/mimic-medical-imaging-qa

# Train with LoRA (requires H100 or equivalent)
# Configuration: rank=32, alpha=64, epochs=3, batch=16
# See training config in configs/
```

Or use the pre-trained MIMIC-LM checkpoint — contact the authors.

---

## Step 6 — Start the vLLM server (H100)
```bash
ssh your-gpu-server

conda activate vllm_deploy
CUDA_VISIBLE_DEVICES=0 vllm serve checkpoints/alive-llama-lora/merged \
  --host 127.0.0.1 --port 8010 \
  --max-model-len 16384 \
  --gpu-memory-utilization 0.90
```

Wait for: `Application startup complete`

---

## Step 7 — Daily startup (all on your local machine)

Open 5 terminals:

**Terminal 1 — SSH tunnel:**
```bash
ssh -L 8080:localhost:8010 user@your-gpu-server
```

**Terminal 2 — TTS server:**
```bash
conda activate medmaic
python3 tts_server.py
```

**Terminal 3 — Next.js classroom:**
```bash
conda activate medmaic
pnpm dev
```
Open http://localhost:3000/medmaic

**Terminal 4 — MIMIC skill server:**
```bash
conda activate medmaic
python3 skills/mimic/server.py
```

**Terminal 5 — Telegram bot via OpenClaw (optional):**
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22
openclaw gateway restart
```

---

## Step 8 — Verify everything is running
```bash
# Check MIMIC-LM
curl -s http://localhost:8080/v1/models

# Check skill server
curl -s http://localhost:8090/health

# Check Next.js
curl -s http://localhost:3000/api/medmaic/lectures
```

---

## Telegram Bot

Set up a Telegram bot via [@BotFather](https://t.me/BotFather), then:
```bash
openclaw config set channels.telegram.botToken "YOUR_BOT_TOKEN"
openclaw config set channels.telegram.dmPolicy open
openclaw config set channels.telegram.allowFrom '["*"]'
openclaw gateway restart
```

Students can then message your bot to access lectures, quizzes, summaries, and Q&A.

---

## Citation
```bibtex
@article{islam2025mimic,
  title={MIMIC: Medical Imaging Multi-Agent Interactive Classroom},
  author={Islam, Md Zabirul and Wang, Ge},
  year={2025},
  institution={Rensselaer Polytechnic Institute}
}
```
