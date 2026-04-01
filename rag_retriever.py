"""
rag_retriever.py
================
Drop-in RAG retrieval module for the MIMIC skill server.

Loads the FAISS index built by rag_index_v2.py and provides:
  - retrieve(query, top_k) -> list of slide chunks
  - get_context(query, top_k) -> concatenated context string

Place this file alongside skills/mimic/server.py and import it.

The FAISS index is loaded once at startup (lazy singleton pattern)
so the first query takes ~2s; subsequent queries are <50ms.

Chat history is handled separately in server.py — this module
is purely retrieval.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────
# Adjust RAG_STORE_DIR to point to wherever rag_index_v2.py saved its output.
# Default: same machine, ~/islamm11/alive/backend/rag_store (via SSH tunnel)
# For local demo: copy rag_store/ to the OpenMAIC project directory.
RAG_STORE_DIR = Path(
    os.environ.get(
        "MIMIC_RAG_STORE",
        str(Path.home() / "Desktop/Research/ALIVE/Openclaw/OpenMAIC/rag_store")
    )
)

# ── Lazy singletons ───────────────────────────────────────────
_index = None
_chunks: list[dict] = []
_model = None
_meta: dict = {}


def _load():
    """Load FAISS index + chunks + embedding model (once)."""
    global _index, _chunks, _model, _meta

    if _index is not None:
        return  # already loaded

    try:
        import faiss
        from sentence_transformers import SentenceTransformer

        index_path  = RAG_STORE_DIR / "faiss.index"
        chunks_path = RAG_STORE_DIR / "chunks.json"
        meta_path   = RAG_STORE_DIR / "meta.json"

        if not index_path.exists():
            log.warning(f"RAG index not found at {index_path} — RAG disabled")
            return

        log.info(f"Loading FAISS index from {index_path} ...")
        _index  = faiss.read_index(str(index_path))

        log.info(f"Loading chunks from {chunks_path} ...")
        _chunks = json.loads(chunks_path.read_text())

        if meta_path.exists():
            _meta = json.loads(meta_path.read_text())
            emb_model_name = _meta.get("embedding_model", "sentence-transformers/all-mpnet-base-v2")
        else:
            emb_model_name = "sentence-transformers/all-mpnet-base-v2"

        log.info(f"Loading embedding model: {emb_model_name} ...")
        _model = SentenceTransformer(emb_model_name)
        log.info(f"RAG ready: {_index.ntotal} vectors, {len(_chunks)} chunks")

    except ImportError as e:
        log.warning(f"RAG dependencies not installed ({e}) — RAG disabled")
    except Exception as e:
        log.warning(f"RAG load error: {e} — RAG disabled")


def is_available() -> bool:
    """Return True if the RAG index loaded successfully."""
    _load()
    return _index is not None and _model is not None


def retrieve(query: str, top_k: int = 4) -> list[dict]:
    """
    Retrieve top_k most relevant slide chunks for the query.

    Returns list of chunk dicts with keys:
        text, lecture_name, slide_name, slide_num, lecture_num, slide_id, score
    Returns [] if RAG is not available.
    """
    _load()
    if _index is None or _model is None:
        return []

    try:
        import numpy as np
        q_emb = _model.encode(
            [query],
            convert_to_numpy=True,
            normalize_embeddings=True,
        )
        D, I = _index.search(q_emb.astype(np.float32), top_k)

        results = []
        for idx, score in zip(I[0], D[0]):
            if idx < 0 or idx >= len(_chunks):
                continue
            chunk = dict(_chunks[idx])
            chunk["score"] = float(score)
            results.append(chunk)
        return results

    except Exception as e:
        log.warning(f"RAG retrieve error: {e}")
        return []


def get_context(query: str, top_k: int = 4, max_chars: int = 1200) -> tuple[str, str]:
    """
    Retrieve context for the query and return (context_text, source_label).

    context_text: concatenated slide texts, truncated to max_chars
    source_label: e.g. "Lecture 3 / Slide 12, Lecture 5 / Slide 7"
    """
    chunks = retrieve(query, top_k=top_k)
    if not chunks:
        return "", "Medical Imaging lectures"

    texts  = []
    labels = []
    total  = 0

    for c in chunks:
        txt = c.get("text", "").strip()
        lbl = f"{c.get('lecture_name', '?')} / {c.get('slide_name', '?')}"
        if total + len(txt) > max_chars:
            txt = txt[:max(0, max_chars - total)]
        if txt:
            texts.append(txt)
            labels.append(lbl)
            total += len(txt)
        if total >= max_chars:
            break

    context = "\n\n".join(texts)
    source  = "; ".join(dict.fromkeys(labels))  # deduplicated, order preserved
    return context, source
