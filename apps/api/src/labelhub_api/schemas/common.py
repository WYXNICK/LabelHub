from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )


class PaginationVO(CamelModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


class PageVO(CamelModel, Generic[T]):
    data: list[T]
    pagination: PaginationVO


class ApiErrorDetailVO(CamelModel):
    code: str
    message: str
    details: Any | None = None
    request_id: str


class ApiErrorVO(CamelModel):
    error: ApiErrorDetailVO
