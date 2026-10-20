"""Thin interface over the LLM/embedding backend so it can be swapped later
(multi-LLM council, a hosted provider) without touching business logic, per
CLAUDE.md's provider-interface principle."""

import logging
from abc import ABC, abstractmethod

import httpx
from anthropic import Anthropic

from app.core.config import settings

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = "http://localhost:11434"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


def _log_claude_usage(call_type: str, model: str, input_tokens: int, output_tokens: int) -> None:
    """Best-effort audit log for the instructor cost dashboard (see
    routers/dashboard.py). Runs in its own short-lived session so a logging
    failure can never break the actual exam/grading call it's logging —
    audit visibility is secondary to the feature working."""
    try:
        from app.db.session import SessionLocal
        from app.models.api_usage import ApiUsageLog
        from app.services.pricing import estimate_claude_cost_usd

        db = SessionLocal()
        try:
            db.add(
                ApiUsageLog(
                    provider="claude",
                    call_type=call_type,
                    model=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    estimated_cost_usd=estimate_claude_cost_usd(model, input_tokens, output_tokens),
                )
            )
            db.commit()
        finally:
            db.close()
    except Exception:
        logger.exception("Failed to log Claude API usage for cost audit")


class LLMProvider(ABC):
    @abstractmethod
    def embed(self, texts: list[str]) -> list[list[float]]: ...

    @abstractmethod
    def generate(
        self, prompt: str, system: str | None = None, max_tokens: int = 2048, usage_label: str = "other"
    ) -> str: ...


def _ollama_embed(texts: list[str], embed_model: str) -> list[list[float]]:
    vectors = []
    with httpx.Client(base_url=OLLAMA_BASE_URL, timeout=60.0) as client:
        for text in texts:
            res = client.post("/api/embeddings", json={"model": embed_model, "prompt": text})
            res.raise_for_status()
            vectors.append(res.json()["embedding"])
    return vectors


def _gemini_embed(texts: list[str], api_key: str, model: str) -> list[list[float]]:
    """Production embeddings — one batchEmbedContents call for every chunk
    instead of Ollama's per-text loop, since Gemini's batch endpoint takes
    the whole list in a single request. Vectors come back in request order."""
    with httpx.Client(base_url=GEMINI_BASE_URL, timeout=60.0) as client:
        res = client.post(
            f"/models/{model}:batchEmbedContents",
            headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            json={
                "requests": [
                    {"model": f"models/{model}", "content": {"parts": [{"text": text}]}} for text in texts
                ]
            },
        )
        res.raise_for_status()
        return [e["values"] for e in res.json()["embeddings"]]


class OllamaProvider(LLMProvider):
    def __init__(self, embed_model: str = "nomic-embed-text", chat_model: str = "llama3.1"):
        self.embed_model = embed_model
        self.chat_model = chat_model

    def embed(self, texts: list[str]) -> list[list[float]]:
        return _ollama_embed(texts, self.embed_model)

    def generate(
        self, prompt: str, system: str | None = None, max_tokens: int = 2048, usage_label: str = "other"
    ) -> str:
        # Ollama runs locally — nothing to log, there's no API spend.
        payload = {
            "model": self.chat_model,
            "prompt": prompt,
            "stream": False,
            "options": {"num_predict": max_tokens},
        }
        if system:
            payload["system"] = system
        with httpx.Client(base_url=OLLAMA_BASE_URL, timeout=120.0) as client:
            res = client.post("/api/generate", json=payload)
            res.raise_for_status()
            return res.json()["response"]


class ClaudeProvider(LLMProvider):
    """Text generation via the Claude API. Anthropic has no embeddings
    endpoint, so embeddings go through Gemini when settings.gemini_api_key
    is set (production), falling back to the locally-run Ollama model
    otherwise (dev default — matches prior behavior exactly when no Gemini
    key is configured). These are two different vector spaces, so whichever
    one indexed a chunk is the only one that can meaningfully search it —
    switching providers means re-indexing Chroma from scratch, not a live
    migration."""

    def __init__(self, api_key: str, model: str, embed_model: str = "nomic-embed-text"):
        self._client = Anthropic(api_key=api_key)
        self.model = model
        self.embed_model = embed_model

    def embed(self, texts: list[str]) -> list[list[float]]:
        if settings.gemini_api_key:
            return _gemini_embed(texts, settings.gemini_api_key, settings.gemini_embed_model)
        return _ollama_embed(texts, self.embed_model)

    def generate(
        self, prompt: str, system: str | None = None, max_tokens: int = 2048, usage_label: str = "other"
    ) -> str:
        kwargs: dict = {
            "model": self.model,
            "max_tokens": max_tokens,
            # This model uses extended thinking by default. These are short,
            # structured JSON-generation tasks (exam questions, grading) that
            # don't need deep reasoning — and on a short prompt, thinking can
            # silently consume the entire max_tokens budget before any
            # visible output is written, returning empty text (observed:
            # stop_reason="max_tokens" with zero TextBlocks). Disabling it
            # makes output reliable regardless of prompt/transcript length.
            "thinking": {"type": "disabled"},
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system
        response = self._client.messages.create(**kwargs)
        _log_claude_usage(usage_label, self.model, response.usage.input_tokens, response.usage.output_tokens)
        return "".join(block.text for block in response.content if block.type == "text")


llm_provider: LLMProvider = (
    ClaudeProvider(api_key=settings.claude_api_key, model=settings.claude_model)
    if settings.claude_api_key
    else OllamaProvider()
)
