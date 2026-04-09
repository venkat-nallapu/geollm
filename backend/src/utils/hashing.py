"""Hashing utilities."""

from __future__ import annotations

import hashlib


def hash_bytes(data: bytes) -> str:
    """Return SHA-256 hash of the provided bytes."""
    return hashlib.sha256(data).hexdigest()
