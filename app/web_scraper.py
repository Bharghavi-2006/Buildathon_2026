"""Small, dependency-free web-search scraper used only as an agent fallback."""
from __future__ import annotations

from html import unescape
import re
from urllib.parse import parse_qs, unquote, urlparse

import httpx


class WebScraperError(Exception):
    pass


class WebScraper:
    """Fetch public search result pages without pretending they are verified data."""
    SEARCH_URL = 'https://html.duckduckgo.com/html/'

    async def search(self, query: str, limit: int = 5) -> list[dict[str, str]]:
        try:
            async with httpx.AsyncClient(timeout=12, follow_redirects=True) as client:
                response = await client.get(
                    self.SEARCH_URL,
                    params={'q': query},
                    headers={'User-Agent': 'Mozilla/5.0 (compatible; SDRDemoFallback/1.0)'},
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise WebScraperError('Public web-search fallback is unavailable.') from exc

        results = []
        pattern = re.compile(r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', re.I | re.S)
        for href, title in pattern.findall(response.text):
            url = self._result_url(unescape(href))
            title = re.sub(r'<[^>]+>', '', title)
            title = unescape(re.sub(r'\s+', ' ', title)).strip()
            if url and title:
                results.append({'title': title, 'url': url})
            if len(results) >= limit:
                break
        return results

    @staticmethod
    def _result_url(href: str) -> str:
        parsed = urlparse(href)
        redirected = parse_qs(parsed.query).get('uddg', [None])[0]
        return unquote(redirected) if redirected else href
