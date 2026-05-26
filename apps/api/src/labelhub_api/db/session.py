from __future__ import annotations

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from labelhub_api.core.config import get_settings


def create_session_factory() -> sessionmaker:
    engine = create_engine(get_settings().database_url, pool_pre_ping=True)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


@lru_cache
def get_session_factory() -> sessionmaker:
    return create_session_factory()


def get_db_session() -> Iterator[Session]:
    session = get_session_factory()()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
