"""
utils/config.py
Loads config/config.yaml and exposes a typed settings object.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import yaml
from loguru import logger


@lru_cache(maxsize=1)
def get_settings() -> dict:
    config_path = Path(__file__).parent.parent.parent / "config" / "config.yaml"
    if not config_path.exists():
        logger.warning(f"config.yaml not found at {config_path}, using defaults")
        return {}
    with open(config_path) as f:
        settings = yaml.safe_load(f)
    logger.info(f"Config loaded from {config_path}")
    return settings


def cfg(*keys: str, default=None):
    """
    Dotted key access helper.
    Usage: cfg("ollama", "model") -> "qwen3.5 9b"
    """
    settings = get_settings()
    val = settings
    for k in keys:
        if not isinstance(val, dict):
            return default
        val = val.get(k, default)
    return val
