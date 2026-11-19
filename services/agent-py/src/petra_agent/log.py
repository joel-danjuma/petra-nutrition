"""JSON logs on stdout: one object per line, from structlog and the stdlib alike.

Context bound with ``structlog.contextvars`` (the request id) lands on every
line written while it is bound, including lines from libraries.

Nothing here redacts. The rule is upstream of it: never pass a request body,
prompt, allergy or profile field to a logger in the first place.
"""

import logging
import sys

import structlog
from structlog.typing import Processor

# winston's spelling, which the TypeScript agent's LOG_LEVEL used.
_ALIASES = {"warn": "warning"}

_SHARED: list[Processor] = [
    structlog.contextvars.merge_contextvars,
    structlog.stdlib.add_logger_name,
    structlog.stdlib.add_log_level,
    structlog.processors.TimeStamper(fmt="iso", utc=True),
]


def configure_logging(level: str) -> None:
    name = _ALIASES.get(level.lower(), level.lower()).upper()

    structlog.configure(
        processors=[*_SHARED, structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        # Caching would pin loggers to this configuration, and
        # structlog.testing.capture_logs could no longer see them.
        cache_logger_on_first_use=False,
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            foreign_pre_chain=_SHARED,
            processors=[
                structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                structlog.processors.dict_tracebacks,
                structlog.processors.JSONRenderer(),
            ],
        )
    )

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(name)

    # httpx logs every request URL at info, and vendor keys travel in query
    # strings (KI-13). Adapters log their own calls, without the URL.
    for noisy in ("httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    logger: structlog.stdlib.BoundLogger = structlog.stdlib.get_logger(name)
    return logger
