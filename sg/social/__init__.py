"""Social publishing drivers. Each driver exposes publish(video, spec) -> dict."""
from __future__ import annotations

from . import instagram, tiktok, youtube

DRIVERS = {
    "youtube": youtube,
    "instagram": instagram,
    "tiktok": tiktok,
}
