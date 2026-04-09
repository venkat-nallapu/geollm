"""Loguru logger setup."""

from __future__ import annotations

from loguru import logger


def setup_logger(debug: bool = False) -> None:
    """Configure Loguru for structured logging."""
    logger.remove()
    logger.add(
        sink=lambda msg: print(msg, end=""),
        colorize=True,
        format="<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
        level="DEBUG" if debug else "INFO",
    )
