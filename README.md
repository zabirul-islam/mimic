# MIMIC: Medical Imaging Multi-Agent Interactive Classroom

A domain-adapted AI classroom platform for medical imaging education built on top of [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC).

## What this repository contains (our contributions)

- `app/api/medmaic/` — Quiz generation, lecture API, Q&A endpoints
- `app/medmaic/` — Classroom and quiz front-end pages
- `skills/mimic/` — Telegram/OpenClaw skill server with LLM-first intent routing
- `data/lectures/` — 23 structured medical imaging lecture JSON files
- `tts_server.py` — Text-to-speech server for AI narration
- `rag_retriever.py` — FAISS-based course-specific RAG retriever

## Built on OpenMAIC

The base classroom framework is from [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) by THU-MAIC.
Please install and set up OpenMAIC first, then add these files on top.

## Setup

1. Clone and set up OpenMAIC: https://github.com/THU-MAIC/OpenMAIC
2. Copy files from this repo into your OpenMAIC directory
3. Follow the startup guide in STARTUP.md

## Dataset

https://huggingface.co/datasets/zabir1996/mimic-medical-imaging-qa

## Paper

MIMIC: Medical Imaging Multi-Agent Interactive Classroom
Md Zabirul Islam, Ge Wang — Rensselaer Polytechnic Institute
