"""Every log line is one JSON object on stdout, whichever library wrote it."""

import json
import logging
from collections.abc import Iterator
from typing import Any

import pytest
import structlog

from petra_agent.log import configure_logging, get_logger


@pytest.fixture(autouse=True)
def clean_context() -> Iterator[None]:
    structlog.contextvars.clear_contextvars()
    yield
    structlog.contextvars.clear_contextvars()


def lines(out: str) -> list[dict[str, Any]]:
    return [json.loads(line) for line in out.splitlines() if line.strip()]


def test_lines_carry_level_time_and_bound_context(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging("info")
    structlog.contextvars.bind_contextvars(request_id="req-1")

    get_logger("petra_agent.test").info("served", status=200)

    [line] = lines(capsys.readouterr().out)
    assert line["event"] == "served"
    assert line["level"] == "info"
    assert line["request_id"] == "req-1"
    assert line["status"] == 200
    assert line["timestamp"].endswith("Z")


def test_stdlib_loggers_are_rendered_as_json_too(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging("info")

    logging.getLogger("asyncpg").warning("pool exhausted")

    [line] = lines(capsys.readouterr().out)
    assert line["event"] == "pool exhausted"
    assert line["level"] == "warning"
    assert line["logger"] == "asyncpg"


@pytest.mark.parametrize("level", ["warn", "WARNING"])
def test_the_level_filters_and_accepts_winston_spelling(
    capsys: pytest.CaptureFixture[str], level: str
) -> None:
    configure_logging(level)
    log = get_logger("petra_agent.test")

    log.info("hidden")
    log.warning("shown")

    assert [line["event"] for line in lines(capsys.readouterr().out)] == ["shown"]


def test_an_exception_is_a_structured_traceback(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging("info")

    try:
        raise ValueError("boom")
    except ValueError:
        get_logger("petra_agent.test").exception("failed")

    [line] = lines(capsys.readouterr().out)
    assert line["exception"][0]["exc_type"] == "ValueError"


def test_http_client_request_lines_are_not_logged(capsys: pytest.CaptureFixture[str]) -> None:
    # Vendor keys travel in query strings (KI-13); httpx logs every URL at info.
    configure_logging("debug")

    logging.getLogger("httpx").info("HTTP Request: GET https://vendor.example/?key=secret")
    logging.getLogger("httpcore.http11").debug("send_request_headers.started")

    assert "secret" not in capsys.readouterr().out
