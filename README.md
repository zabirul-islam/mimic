# MIMIC

> **Course-derivation pipeline + benchmark + domain-adapted LLM for slide-anchored medical-imaging tutoring.**

[![License: code MIT](https://img.shields.io/badge/code-MIT-blue.svg)](LICENSE)
[![License: data CC BY-NC 4.0](https://img.shields.io/badge/data-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)
[![Dataset on HuggingFace](https://img.shields.io/badge/%F0%9F%A4%97%20Dataset-zabir1996%2Fmimic--medical--imaging--qa-yellow)](https://huggingface.co/datasets/zabir1996/mimic-medical-imaging-qa)
[![Built on OpenMAIC](https://img.shields.io/badge/built%20on-OpenMAIC-purple)](https://github.com/THU-MAIC/OpenMAIC)
[![Paper](https://img.shields.io/badge/Paper-PDF-red)](#paper)
[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/downloads/)

MIMIC (Medical Imaging Multi-Agent Interactive Classroom) is a *course-derivation pipeline* that turns any slide-and-transcript course into (i) a Bloom-stratified question--answer benchmark, (ii) a slide-aligned structured record format, and (iii) a domain-adapted LoRA-tuned Llama-3.1-8B model (MIMIC-LM). It runs as a domain extension on top of the open-source [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) classroom framework. On a 23-lecture undergraduate medical imaging course, the resulting model improves answer quality and drops factual errors to 0%, while running ~2.7× faster than the base model.

> **Built on OpenMAIC.** This repository contains the MIMIC-specific contributions only (medical-imaging dataset, domain-adapted model, classroom skill, RAG retriever, ingestion pipeline). The base classroom framework — playback engine, multi-agent UI, action/scene runtime — comes from OpenMAIC by THU-MAIC and must be installed first. See [Setup](#setup).

---

## Headline numbers

Open-book question answering on the 508-question held-out test set. Δ is MIMIC-LM minus base.

| Metric                              | Base Llama-3.1-8B | Base + RAG | **MIMIC-LM** | Δ vs base |
|-------------------------------------|------------------:|-----------:|-------------:|----------:|
| BERTScore F1                        | 0.737             | 0.744      | **0.769**    | +0.031    |
| ROUGE-L                             | 0.422             | 0.434      | **0.476**    | +0.054    |
| Slide-grounded factual error rate ↓ | 0.20%             | 0.39%      | **0.00%**    | −0.20 pp  |
| Mean response latency (s) ↓         | 1.591             | —          | **0.595**    | 2.67× faster |

External LLM-as-judge agreement (508 paired comparisons; both judges score MIMIC-LM above base on every axis):

| Judge            | Factuality Δ | Pedagogy Δ | Conciseness Δ | Reference-agreement Δ | MIMIC-LM win rate |
|------------------|-------------:|-----------:|--------------:|-----------------------:|------------------:|
| GPT-4o           | +0.16        | +0.25      | +0.17         | +0.28                  | 26.4%             |
| Claude Sonnet 4.5| +0.32        | +0.34      | +0.59         | +0.44                  | 31.8%             |

Per-table source files are in `results/` with the row-by-row mapping in `results/eval_summary.md`.

---

## Released artefacts

| Artefact                       | Where it lives                                                                                       |
|--------------------------------|------------------------------------------------------------------------------------------------------|
| QA dataset (5,207 pairs)       | <https://huggingface.co/datasets/zabir1996/mimic-medical-imaging-qa>                                 |
| Lecture slides + transcripts   | <https://huggingface.co/datasets/zabir1996/mip-bench/tree/main/Lectures>                              |
| Evaluation results (per table) | [`results/`](results/) — one JSON per metric, with [`eval_summary.md`](results/eval_summary.md) map |
| Codebase (this repository)     | MIMIC-specific contributions on top of OpenMAIC                                                      |
| Reproduction recipe            | [`REPRODUCE.md`](REPRODUCE.md)                                                                       |

---

## What this repository contains

MIMIC-specific contributions only. The base framework is OpenMAIC.

```
app/api/medmaic/      Quiz generation, lecture API, Q&A endpoints
app/medmaic/          Classroom and quiz front-end pages
skills/mimic/         Telegram / OpenClaw skill server
  server.py           Flask webhook with LLM-first intent routing
  rag_retriever.py    FAISS-based course-specific RAG retriever
  telegram_bot.py     Direct Telegram bot (alternative to OpenClaw gateway)
  SKILL.md            OpenClaw skill descriptor
data/lectures/        23 structured medical-imaging lecture JSON files
tts_server.py         Text-to-speech server for AI narration
results/              Per-table evaluation JSONs (paper Tables 3, 5, 6, 7)
REPRODUCE.md          End-to-end reproduction recipe
```

---

## Quickstart — load the released artefacts (no install)

```bash
# 1. QA dataset
python -c "from datasets import load_dataset; ds = load_dataset('zabir1996/mimic-medical-imaging-qa'); print(ds['train'][0])"

# 2. Inspect released evaluation results
curl -L https://raw.githubusercontent.com/zabirul-islam/mimic/main/results/judge_gpt-4o.summary.json
curl -L https://raw.githubusercontent.com/zabirul-islam/mimic/main/results/eval_summary.md
```

---

## Reproducing the paper numbers

See [`REPRODUCE.md`](REPRODUCE.md) for the end-to-end course-derivation pipeline (ingest → generate QA → filter → fine-tune → infer → score → judge → aggregate). Runs in ~2 hours on a single H100 PCIe.

---

## Setup — full classroom

The MIMIC classroom requires the OpenMAIC base framework + the MIMIC contributions in this repository.

**Prerequisites**

- Python 3.12 (conda recommended)
- Node.js 22+ (via nvm)
- NVIDIA GPU with 80 GB+ VRAM for vLLM serving of MIMIC-LM
- Conda environment named `medmaic`

### Step 1 — Install OpenMAIC (base classroom)

```bash
git clone https://github.com/THU-MAIC/OpenMAIC.git
cd OpenMAIC
nvm install 22 && nvm use 22
npm install -g pnpm
pnpm install
```

### Step 2 — Add MIMIC contributions

```bash
# Clone this repository alongside OpenMAIC
cd ..
git clone https://github.com/zabirul-islam/mimic.git mimic-files

# Copy MIMIC contributions into your OpenMAIC tree
cp -r mimic-files/app/api/medmaic   OpenMAIC/app/api/medmaic
cp -r mimic-files/app/medmaic       OpenMAIC/app/medmaic
cp -r mimic-files/skills/mimic      OpenMAIC/skills/mimic
cp -r mimic-files/data/lectures     OpenMAIC/data/lectures
cp    mimic-files/tts_server.py     OpenMAIC/
cp    mimic-files/rag_retriever.py  OpenMAIC/
```

### Step 3 — Python dependencies

```bash
conda create -n medmaic python=3.12
conda activate medmaic
pip install flask requests python-telegram-bot sentence-transformers faiss-cpu
```

### Step 4 — Lecture data

Each lecture is a JSON file in `data/lectures/` of the shape:

```json
{
  "lectureId": "Lecture_01",
  "lectureTitle": "Medical Imaging — Lecture 01",
  "totalSlides": 50,
  "slides": [
    {"slideNumber": 1, "title": "Introduction", "fullText": "...", "imageUrl": "..."}
  ]
}
```

To adapt MIMIC to your own course:

1. Organise your slides as JPEG images and per-slide transcripts as plain text.
2. Run the ingestion step (see [`REPRODUCE.md`](REPRODUCE.md)) to produce structured per-lecture JSON files.
3. Place the resulting JSON files in `data/lectures/`.

The 23 medical-imaging lectures used in the paper:
<https://huggingface.co/datasets/zabir1996/mip-bench/tree/main/Lectures>

### Step 5 — Fine-tune MIMIC-LM (optional)

```bash
# Download the QA dataset
# https://huggingface.co/datasets/zabir1996/mimic-medical-imaging-qa
# Then train with LoRA on an H100 (rank=32, alpha=64, epochs=3, batch=16).
# See REPRODUCE.md for the full configuration.
```

Or use a pre-trained MIMIC-LM checkpoint — contact the authors.

### Step 6 — Serve MIMIC-LM on the GPU host

```bash
ssh your-gpu-server
conda activate vllm_deploy
CUDA_VISIBLE_DEVICES=0 vllm serve checkpoints/alive-llama-lora/merged \
  --host 127.0.0.1 --port 8010 \
  --max-model-len 16384 \
  --gpu-memory-utilization 0.90
```

Wait for `Application startup complete`.

### Step 7 — Run the classroom locally

Open 5 terminals on your local machine:

```bash
# T1 — SSH tunnel
ssh -L 8080:localhost:8010 user@your-gpu-server

# T2 — TTS server
conda activate medmaic && python3 tts_server.py

# T3 — Next.js classroom
conda activate medmaic && pnpm dev   # http://localhost:3000/medmaic

# T4 — MIMIC skill server
conda activate medmaic && python3 skills/mimic/server.py

# T5 — Telegram bot via OpenClaw (optional)
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22
openclaw gateway restart
```

### Step 8 — Sanity checks

```bash
curl -s http://localhost:8080/v1/models                  # MIMIC-LM is up
curl -s http://localhost:8090/health                     # skill server
curl -s http://localhost:3000/api/medmaic/lectures       # classroom API
```

---

## Telegram bot

Create a bot via [@BotFather](https://t.me/BotFather), then route it through OpenClaw:

```bash
openclaw config set channels.telegram.botToken "YOUR_BOT_TOKEN"
openclaw config set channels.telegram.dmPolicy open
openclaw config set channels.telegram.allowFrom '["*"]'
openclaw gateway restart
```

Students message the bot to access lectures, quizzes, summaries, and free-text Q&A grounded in the active slide.

---

## Paper

> **MIMIC: A Course-Derivation Pipeline and Benchmark for Slide-Anchored Tutoring with a Domain-Adapted Large Language Model.** Md Zabirul Islam, Ge Wang. *Computers and Education: Artificial Intelligence* (under review), 2026.

```bibtex
@article{islam2026mimic,
  title  = {MIMIC: A Course-Derivation Pipeline and Benchmark for
            Slide-Anchored Tutoring with a Domain-Adapted Large
            Language Model},
  author = {Islam, Md Zabirul and Wang, Ge},
  journal= {Computers and Education: Artificial Intelligence},
  year   = {2026},
  note   = {Under review}
}
```

## License

- **Code:** MIT
- **Released benchmark artifacts** (QA dataset, evaluation result files, prompts): CC BY-NC 4.0
- **Lecture slides and transcripts:** © Dr. Ge Wang, Rensselaer Polytechnic Institute. Released for research and benchmarking with the instructor's permission.

## Acknowledgements

MIMIC is built on top of the open-source [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) (Open Multi-Agent Interactive Classroom) framework by THU-MAIC. We thank the OpenMAIC authors for releasing the base classroom platform — playback engine, multi-agent UI, action runtime, and orchestration — that made this domain extension possible. Computing resources provided by Rensselaer Polytechnic Institute.
