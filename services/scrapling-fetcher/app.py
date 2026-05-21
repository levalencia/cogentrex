from __future__ import annotations

import os
import re
from typing import Any

from fastapi import FastAPI, HTTPException
from markdownify import markdownify as to_markdown
from pydantic import BaseModel, HttpUrl
from scrapling.fetchers import Fetcher

app = FastAPI(title="Cogentrex Scrapling Fetcher")
FETCH_TIMEOUT_SECONDS = float(os.getenv("SCRAPLING_FETCH_TIMEOUT_SECONDS", "20"))


class FetchRequest(BaseModel):
    url: HttpUrl


class FetchResponse(BaseModel):
    url: str
    title: str
    markdown: str
    description: str | None = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/fetch", response_model=FetchResponse)
def fetch_page(request: FetchRequest) -> FetchResponse:
    requested_url = str(request.url)
    try:
        page = Fetcher.get(requested_url, timeout=FETCH_TIMEOUT_SECONDS)
    except Exception as exc:  # pragma: no cover - depends on remote sites/browser runtime
        raise HTTPException(status_code=502, detail="Fetch failed") from exc

    status = getattr(page, "status", 200)
    if isinstance(status, int) and status >= 400:
        raise HTTPException(status_code=502, detail=f"Upstream returned {status}")

    html = _decode_body(getattr(page, "body", b""), getattr(page, "encoding", None))
    markdown = _clean_markdown(to_markdown(html, heading_style="ATX"))
    if not markdown:
        markdown = _clean_markdown(_selector_text(page))
    if not markdown:
        raise HTTPException(status_code=422, detail="No readable content extracted")

    return FetchResponse(
        url=requested_url,
        title=_extract_title(page, html) or requested_url,
        markdown=markdown[:8000],
        description=_extract_description(page, html),
    )


def _decode_body(body: Any, encoding: str | None) -> str:
    if isinstance(body, bytes):
        return body.decode(encoding or "utf-8", "replace")
    if isinstance(body, str):
        return body
    return ""


def _selector_text(page: Any) -> str:
    get_all_text = getattr(page, "get_all_text", None)
    if callable(get_all_text):
        try:
            return str(get_all_text(separator="\n", strip=True))
        except TypeError:
            return str(get_all_text())
    return ""


def _extract_title(page: Any, html: str) -> str | None:
    try:
        title = page.css("title::text").get()
        if title:
            return str(title).strip()
    except Exception:
        pass
    match = re.search(r"<title[^>]*>(.*?)</title>", html, flags=re.IGNORECASE | re.DOTALL)
    return _clean_inline(match.group(1)) if match else None


def _extract_description(page: Any, html: str) -> str | None:
    try:
        description = page.css('meta[name="description"]::attr(content)').get()
        if description:
            return str(description).strip()
    except Exception:
        pass
    match = re.search(
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']',
        html,
        flags=re.IGNORECASE,
    )
    return _clean_inline(match.group(1)) if match else None


def _clean_markdown(value: str) -> str:
    lines = [line.rstrip() for line in value.replace("\r\n", "\n").split("\n")]
    compact: list[str] = []
    blank = False
    for line in lines:
        is_blank = not line.strip()
        if is_blank and blank:
            continue
        compact.append(line)
        blank = is_blank
    return "\n".join(compact).strip()


def _clean_inline(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()
