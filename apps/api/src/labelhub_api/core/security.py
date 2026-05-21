from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from datetime import UTC, datetime

PASSWORD_ITERATIONS = 260_000


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def hash_password(password: str, salt: bytes | None = None) -> str:
    resolved_salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        resolved_salt,
        PASSWORD_ITERATIONS,
    )
    return "pbkdf2_sha256${}${}${}".format(
        PASSWORD_ITERATIONS,
        _b64encode(resolved_salt),
        _b64encode(digest),
    )


def verify_password(password: str, password_hash: str) -> bool:
    try:
        scheme, iterations_raw, salt_raw, expected_raw = password_hash.split("$", 3)
    except ValueError:
        return False
    if scheme != "pbkdf2_sha256":
        return False

    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        _b64decode(salt_raw),
        int(iterations_raw),
    )
    return hmac.compare_digest(_b64encode(digest), expected_raw)


def create_session_token(*, user_id: str, expires_at: datetime, secret: str) -> str:
    payload = {
        "userId": user_id,
        "exp": int(expires_at.timestamp()),
    }
    payload_raw = _b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(secret.encode("utf-8"), payload_raw.encode("ascii"), hashlib.sha256)
    return f"{payload_raw}.{_b64encode(signature.digest())}"


def parse_session_token(token: str, secret: str) -> str | None:
    try:
        payload_raw, signature_raw = token.split(".", 1)
    except ValueError:
        return None

    expected_signature = hmac.new(
        secret.encode("utf-8"),
        payload_raw.encode("ascii"),
        hashlib.sha256,
    )
    if not hmac.compare_digest(_b64encode(expected_signature.digest()), signature_raw):
        return None

    try:
        payload = json.loads(_b64decode(payload_raw))
    except (ValueError, TypeError):
        return None

    expires_at = datetime.fromtimestamp(int(payload.get("exp", 0)), tz=UTC)
    if expires_at <= datetime.now(UTC):
        return None
    user_id = payload.get("userId")
    return user_id if isinstance(user_id, str) else None
