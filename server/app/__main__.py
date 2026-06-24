from contextlib import asynccontextmanager
from typing import Sequence

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.orm import Session

import app.models as models
import app.schemas as schemas
from app.ai_editor import AIEditorError, edit_document
from app.data import DOCUMENT_1, DOCUMENT_2
from app.db import Base, SessionLocal, engine, get_db
from app.html_safety import sanitize_document_html


def seed_initial_documents(db: Session) -> None:
    """Ensure the in-memory database has the starter documents and version 1."""
    seed_documents = ((1, DOCUMENT_1), (2, DOCUMENT_2))
    for document_id, content in seed_documents:
        document = db.get(models.Document, document_id)
        if document is None:
            document = models.Document(id=document_id)
            db.add(document)

        first_version = db.scalar(
            select(models.DocumentVersion).where(
                models.DocumentVersion.document_id == document_id,
                models.DocumentVersion.version_number == 1,
            )
        )
        if first_version is None:
            db.add(
                models.DocumentVersion(
                    document_id=document_id,
                    version_number=1,
                    content=content,
                )
            )
    db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Create the database tables
    Base.metadata.create_all(bind=engine)
    # Insert seed data
    with SessionLocal() as db:
        seed_initial_documents(db)
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_document_or_404(document_id: int, db: Session) -> models.Document:
    document = db.get(models.Document, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


def get_version_or_404(
    document_id: int, version_id: int, db: Session
) -> models.DocumentVersion:
    version = db.scalar(
        select(models.DocumentVersion).where(
            models.DocumentVersion.document_id == document_id,
            models.DocumentVersion.id == version_id,
        )
    )
    if version is None:
        raise HTTPException(status_code=404, detail="Document version not found")
    return version


def get_latest_version(
    document_id: int, db: Session
) -> models.DocumentVersion | None:
    return db.scalar(
        select(models.DocumentVersion)
        .where(models.DocumentVersion.document_id == document_id)
        .order_by(models.DocumentVersion.version_number.desc())
        .limit(1)
    )


def get_next_version_number(document_id: int, db: Session) -> int:
    current_max = db.scalar(
        select(func.max(models.DocumentVersion.version_number)).where(
            models.DocumentVersion.document_id == document_id
        )
    )
    return (current_max or 0) + 1


def list_versions(
    document_id: int, db: Session
) -> Sequence[models.DocumentVersion]:
    return db.scalars(
        select(models.DocumentVersion)
        .where(models.DocumentVersion.document_id == document_id)
        .order_by(models.DocumentVersion.version_number)
    ).all()


def serialize_document(
    document: models.Document,
    current_version: models.DocumentVersion,
    db: Session,
) -> schemas.DocumentRead:
    versions = list_versions(document.id, db)
    return schemas.DocumentRead(
        id=document.id,
        content=current_version.content,
        current_version=current_version,
        versions=versions,
    )


@app.get("/document/{document_id}")
def get_document(
    document_id: int,
    version_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> schemas.DocumentRead:
    """Get a document and the selected version from the database."""
    document = get_document_or_404(document_id, db)
    version = (
        get_version_or_404(document_id, version_id, db)
        if version_id is not None
        else get_latest_version(document_id, db)
    )
    if version is None:
        raise HTTPException(status_code=404, detail="Document has no versions")
    return serialize_document(document, version, db)


@app.get("/document/{document_id}/versions")
def get_document_versions(
    document_id: int, db: Session = Depends(get_db)
) -> list[schemas.DocumentVersionMetadata]:
    """List versions for a document."""
    get_document_or_404(document_id, db)
    return list_versions(document_id, db)


@app.get("/document/{document_id}/versions/{version_id}")
def get_document_version(
    document_id: int, version_id: int, db: Session = Depends(get_db)
) -> schemas.DocumentVersionRead:
    """Get one version of a document."""
    get_document_or_404(document_id, db)
    return get_version_or_404(document_id, version_id, db)


@app.post("/document/{document_id}/versions")
def create_document_version(
    document_id: int,
    version_request: schemas.DocumentVersionCreate,
    db: Session = Depends(get_db),
) -> schemas.DocumentVersionRead:
    """Create a new document version from submitted content or an existing version."""
    get_document_or_404(document_id, db)
    if version_request.content is not None:
        content = sanitize_document_html(version_request.content)
    elif version_request.source_version_id is not None:
        source_version = get_version_or_404(
            document_id, version_request.source_version_id, db
        )
        content = source_version.content
    else:
        latest_version = get_latest_version(document_id, db)
        if latest_version is None:
            raise HTTPException(status_code=404, detail="Document has no versions")
        content = latest_version.content

    version = models.DocumentVersion(
        document_id=document_id,
        version_number=get_next_version_number(document_id, db),
        content=content,
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    return version


@app.put("/document/{document_id}/versions/{version_id}")
def save_document_version(
    document_id: int,
    version_id: int,
    document: schemas.DocumentSaveRequest,
    db: Session = Depends(get_db),
) -> schemas.DocumentVersionRead:
    """Save changes to an existing document version."""
    get_document_or_404(document_id, db)
    version = get_version_or_404(document_id, version_id, db)
    if document.base_revision is not None and document.base_revision != version.revision:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Document version has changed since it was loaded",
                "current_revision": version.revision,
                "current_content": version.content,
            },
        )
    version.content = sanitize_document_html(document.content)
    version.revision += 1
    db.commit()
    db.refresh(version)
    return version


@app.post("/save/{document_id}")
def save(
    document_id: int,
    document: schemas.DocumentSaveRequest,
    db: Session = Depends(get_db),
):
    """Save the latest document version to preserve the original API contract."""
    get_document_or_404(document_id, db)
    latest_version = get_latest_version(document_id, db)
    if latest_version is None:
        raise HTTPException(status_code=404, detail="Document has no versions")
    if (
        document.base_revision is not None
        and document.base_revision != latest_version.revision
    ):
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Document version has changed since it was loaded",
                "current_revision": latest_version.revision,
                "current_content": latest_version.content,
            },
        )
    latest_version.content = sanitize_document_html(document.content)
    latest_version.revision += 1
    db.commit()
    db.refresh(latest_version)
    return {
        "document_id": document_id,
        "version_id": latest_version.id,
        "revision": latest_version.revision,
        "content": latest_version.content,
    }


@app.post("/ai/edit")
def ai_edit(
    edit_request: schemas.AIEditRequest, db: Session = Depends(get_db)
) -> schemas.AIEditResponse:
    """Apply a constrained AI-assisted edit to the selected document version."""
    get_document_or_404(edit_request.document_id, db)
    get_version_or_404(edit_request.document_id, edit_request.version_id, db)
    try:
        return edit_document(edit_request)
    except AIEditorError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
