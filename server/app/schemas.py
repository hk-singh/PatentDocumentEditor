from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DocumentBase(BaseModel):
    content: str


class DocumentSaveRequest(DocumentBase):
    base_revision: int | None = Field(default=None, ge=1)


class DocumentVersionCreate(BaseModel):
    content: str | None = None
    source_version_id: int | None = None


class DocumentVersionMetadata(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    document_id: int
    version_number: int
    revision: int


class DocumentVersionRead(DocumentVersionMetadata):
    content: str


class DocumentRead(DocumentBase):
    id: int
    current_version: DocumentVersionRead
    versions: list[DocumentVersionMetadata]


class AIUploadedContext(BaseModel):
    filename: str = Field(max_length=255)
    content: str = Field(max_length=20_000)


class AIEditRequest(BaseModel):
    document_id: int
    version_id: int
    content: str = Field(min_length=1, max_length=200_000)
    instruction: str = Field(min_length=1, max_length=4_000)
    uploaded_contexts: list[AIUploadedContext] = Field(default_factory=list)


class AIEditEvidence(BaseModel):
    source: Literal["user_instruction", "document_text", "uploaded_context"]
    quote: str = Field(min_length=1, max_length=1_000)


class AIEditOperation(BaseModel):
    type: Literal["replace_block", "delete_block", "insert_after", "insert_before"]
    target_block_id: str
    html: str | None = None
    basis: list[AIEditEvidence] = Field(default_factory=list)


class AIUsageMetadata(BaseModel):
    model: str
    estimated_input_tokens: int
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None
    latency_ms: int | None = None


class AIEditResponse(BaseModel):
    status: Literal["applied", "needs_clarification", "refused"]
    summary: str
    content: str
    operations: list[AIEditOperation] = Field(default_factory=list)
    clarifying_question: str | None = None
    usage: AIUsageMetadata | None = None
