import uuid

import chromadb
from chromadb.config import Settings

from app.services.llm_provider import llm_provider

_client = chromadb.PersistentClient(path="storage/chroma", settings=Settings(anonymized_telemetry=False))
_collection = _client.get_or_create_collection("course_materials")

# Submissions live in a physically separate collection from shared course
# material — not just a different metadata filter on the same collection.
# A student's submitted work is private; putting it in its own collection
# means a filtering bug in the course-material path can't accidentally
# surface one student's work to another, or to a different exam's scope.
_submissions_collection = _client.get_or_create_collection("student_submissions")


def index_material_chunks(material_id: uuid.UUID, module_id: uuid.UUID, chunks: list[str]) -> None:
    if not chunks:
        return
    embeddings = llm_provider.embed(chunks)
    ids = [f"{material_id}:{i}" for i in range(len(chunks))]
    metadatas = [{"material_id": str(material_id), "module_id": str(module_id), "chunk_index": i} for i in range(len(chunks))]
    _collection.upsert(ids=ids, embeddings=embeddings, documents=chunks, metadatas=metadatas)


def delete_material_chunks(material_id: uuid.UUID) -> None:
    _collection.delete(where={"material_id": str(material_id)})


def search(module_ids: list[uuid.UUID], query_text: str, k: int = 5) -> list[dict]:
    """Retrieves the top-k chunks, scoped to the given modules only. This is
    the enforcement point that keeps question generation inside instructor-
    defined exam scope (CLAUDE.md §5): retrieval never sees chunks from
    modules outside `module_ids`."""
    if not module_ids:
        return []
    query_embedding = llm_provider.embed([query_text])[0]
    results = _collection.query(
        query_embeddings=[query_embedding],
        n_results=k,
        where={"module_id": {"$in": [str(m) for m in module_ids]}},
    )
    if not results["ids"] or not results["ids"][0]:
        return []
    return [
        {"text": doc, "metadata": meta, "distance": dist}
        for doc, meta, dist in zip(
            results["documents"][0], results["metadatas"][0], results["distances"][0]
        )
    ]


def index_submission_chunks(
    submission_id: uuid.UUID, assignment_id: uuid.UUID, student_id: uuid.UUID, chunks: list[str]
) -> None:
    if not chunks:
        return
    embeddings = llm_provider.embed(chunks)
    ids = [f"{submission_id}:{i}" for i in range(len(chunks))]
    metadatas = [
        {
            "submission_id": str(submission_id),
            "assignment_id": str(assignment_id),
            "student_id": str(student_id),
            "chunk_index": i,
        }
        for i in range(len(chunks))
    ]
    _submissions_collection.upsert(ids=ids, embeddings=embeddings, documents=chunks, metadatas=metadatas)


def delete_submission_chunks(submission_id: uuid.UUID) -> None:
    _submissions_collection.delete(where={"submission_id": str(submission_id)})


def search_submissions(
    assignment_ids: list[uuid.UUID], student_id: uuid.UUID, query_text: str, k: int = 5
) -> list[dict]:
    """Retrieves a specific student's own submission chunks for the given
    assignments — `student_id` is required (not optional) so this can't be
    called in a way that accidentally omits the privacy boundary. Combined
    with the separate collection, a student's work is unreachable from any
    query that isn't explicitly theirs."""
    if not assignment_ids:
        return []
    query_embedding = llm_provider.embed([query_text])[0]
    results = _submissions_collection.query(
        query_embeddings=[query_embedding],
        n_results=k,
        where={
            "$and": [
                {"assignment_id": {"$in": [str(a) for a in assignment_ids]}},
                {"student_id": str(student_id)},
            ]
        },
    )
    if not results["ids"] or not results["ids"][0]:
        return []
    return [
        {"text": doc, "metadata": meta, "distance": dist}
        for doc, meta, dist in zip(
            results["documents"][0], results["metadatas"][0], results["distances"][0]
        )
    ]
