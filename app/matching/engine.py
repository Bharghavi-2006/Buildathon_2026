"""Explainable, configuration-only representative matching.

This module deliberately uses only configuration stored on campaigns and access
profiles.  In particular, it never reads outreach events or conversion data.
"""
from datetime import datetime
from math import ceil
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


WEIGHTS = {
    "icp_fit": 30,
    "geography_fit": 20,
    "channel_fit": 20,
    "capacity": 15,
    "specialization": 10,
    "working_hours": 5,
}


def _values(values):
    return {str(value).strip().lower() for value in (values or []) if str(value).strip()}


def _channel(value):
    value = str(value).strip().lower()
    return {"messages": "message", "message": "message", "call": "call",
            "calls": "call", "voice": "call", "linkedin": "linkedin",
            "email": "email"}.get(value, value)


def _overlap(left, right):
    """Return values from left matched exactly or by a useful phrase match."""
    return {item for item in left if any(item == candidate or item in candidate or candidate in item for candidate in right)}


def _hours(value):
    if not isinstance(value, dict):
        return None
    start, end = value.get("start", value.get("start_hour")), value.get("end", value.get("end_hour"))
    try:
        start, end = float(start), float(end)
    except (TypeError, ValueError):
        return None
    if not 0 <= start <= 24 or not 0 <= end <= 24 or start == end:
        return None
    return start, end


def _hour_overlap(campaign_hours, rep_hours):
    """Overlap in hours for same-timezone schedules; overnight schedules are supported."""
    def intervals(window):
        start, end = window
        return [(start, end)] if start < end else [(start, 24), (0, end)]
    overlap = sum(max(0, min(a_end, b_end) - max(a_start, b_start))
                  for a_start, a_end in intervals(campaign_hours)
                  for b_start, b_end in intervals(rep_hours))
    campaign_duration = sum(end - start for start, end in intervals(campaign_hours))
    return overlap / campaign_duration if campaign_duration else 0


def _utc_window(hours, timezone):
    """Convert a local working window to UTC on a fixed date.

    The fixed date keeps the calculation repeatable; it is not an assertion
    about a representative's availability on that date.
    """
    try:
        zone = ZoneInfo(timezone)
    except (ZoneInfoNotFoundError, TypeError):
        return None
    start, end = hours
    anchor = datetime(2024, 1, 15, tzinfo=zone)
    offset = anchor.utcoffset().total_seconds() / 3600
    return ((start - offset) % 24, (end - offset) % 24)


def _campaign_targets(campaign):
    """Read the campaign's structured fields without assuming a wizard shape."""
    config = getattr(campaign, "icp_config", {}) or {}
    if not isinstance(config, dict):
        config = {}
    def from_keys(*keys):
        values = []
        for key in keys:
            value = config.get(key, [])
            values.extend(value if isinstance(value, list) else [value])
        return _values(values)
    industries = _values(getattr(campaign, "target_industries", [])) | from_keys("industries", "industry", "domains", "domain")
    roles = _values(getattr(campaign, "target_roles", [])) | from_keys("target_roles", "roles", "seniority")
    return industries, roles


class RepMatchEngine:
    """Scores only stored campaign and roster configuration; never performance data."""

    def evaluate(self, campaign, profile, current_load=0, campaign_working_hours=None):
        reasons, warnings = [], []
        industries, roles = _campaign_targets(campaign)
        specialties = _values(getattr(profile, "specialties", []))
        targets = industries | roles
        breakdown = {}

        matched_targets = _overlap(targets, specialties)
        if not targets:
            breakdown["icp_fit"] = 0
            warnings.append("Campaign ICP industries and roles are not configured")
        elif not specialties:
            breakdown["icp_fit"] = 0
            warnings.append("Representative specialization is not configured")
        else:
            breakdown["icp_fit"] = ceil(WEIGHTS["icp_fit"] * len(matched_targets) / len(targets))
            if matched_targets:
                reasons.append("ICP capability match: " + ", ".join(sorted(matched_targets)))
            else:
                warnings.append("No stored representative capability matches the campaign ICP")

        geography = str(getattr(campaign, "target_geography", "") or "").strip().lower()
        regions = _values(getattr(profile, "regions", []))
        campaign_timezone = (campaign_working_hours or {}).get("timezone", "") if isinstance(campaign_working_hours, dict) else ""
        rep_timezone = getattr(profile, "timezone", "") or ""
        if not geography:
            breakdown["geography_fit"] = 0
            warnings.append("Campaign target geography is not configured")
        elif not regions:
            breakdown["geography_fit"] = 0
            warnings.append("Representative geography is not configured")
        elif geography in regions or _overlap({geography}, regions):
            breakdown["geography_fit"] = 14
            reasons.append(f"Geography match: {getattr(campaign, 'target_geography')}")
        elif "global" in regions:
            breakdown["geography_fit"] = 8
            reasons.append("Representative is configured for global coverage")
        else:
            breakdown["geography_fit"] = 0
            warnings.append("Representative geography does not match the campaign target")
        if geography and regions:
            if not campaign_timezone or not rep_timezone:
                warnings.append("Timezone compatibility is unverified")
            elif campaign_timezone.lower() == rep_timezone.lower():
                breakdown["geography_fit"] += 6
                reasons.append(f"Timezone match: {rep_timezone}")
            else:
                warnings.append(f"Timezone differs: campaign {campaign_timezone}, representative {rep_timezone}")

        requested_channels = {_channel(value) for value in (getattr(campaign, "active_channels", []) or [])}
        supported_channels = {_channel(value) for value in (getattr(profile, "supported_channels", []) or [])}
        matched_channels = requested_channels & supported_channels
        if not requested_channels:
            breakdown["channel_fit"] = 0
            warnings.append("Campaign has no enabled channels")
        elif not supported_channels:
            breakdown["channel_fit"] = 0
            warnings.append("Representative supported channels are not configured")
        else:
            breakdown["channel_fit"] = ceil(WEIGHTS["channel_fit"] * len(matched_channels) / len(requested_channels))
            if matched_channels:
                reasons.append("Supports channels: " + ", ".join(sorted(matched_channels)))
            missing = requested_channels - supported_channels
            if missing:
                warnings.append("Does not support campaign channels: " + ", ".join(sorted(missing)))

        capacity = max(0, int(getattr(profile, "max_active_leads", 0) or 0))
        load = max(0, int(current_load or 0))
        utilization = round((load / capacity) * 100, 1) if capacity else 100.0
        breakdown["capacity"] = round(WEIGHTS["capacity"] * max(0, 1 - load / capacity)) if capacity else 0
        if not capacity:
            warnings.append("Representative has no configured lead capacity")
        else:
            reasons.append(f"Current capacity is {utilization:g}% utilized ({load}/{capacity} leads)")
            if utilization >= 100:
                warnings.append("Representative is over capacity; assignment remains allowed")
            elif utilization >= 95:
                warnings.append("Representative is at very high capacity")
            elif utilization >= 85:
                warnings.append("Representative is near capacity")

        role_matches = _overlap(roles, specialties)
        if not specialties:
            breakdown["specialization"] = 0
            warnings.append("Specialization fit is unverified")
        elif not roles and not industries:
            breakdown["specialization"] = 0
            warnings.append("Campaign has no role or domain specialization to compare")
        elif role_matches or _overlap(industries, specialties):
            breakdown["specialization"] = WEIGHTS["specialization"]
            reasons.append("Stored specialization aligns with campaign targeting")
        else:
            breakdown["specialization"] = 0

        campaign_hours = _hours(campaign_working_hours)
        rep_hours = _hours(getattr(profile, "working_hours", {}))
        if not campaign_hours or not rep_hours:
            breakdown["working_hours"] = 0
            warnings.append("Working-hours overlap is unverified")
        elif not campaign_timezone or not rep_timezone:
            breakdown["working_hours"] = 0
            warnings.append("Working-hours overlap is unverified because timezone is missing")
        else:
            campaign_utc = _utc_window(campaign_hours, campaign_timezone)
            rep_utc = _utc_window(rep_hours, rep_timezone)
            if not campaign_utc or not rep_utc:
                breakdown["working_hours"] = 0
                warnings.append("Working-hours overlap is unverified because timezone is invalid")
            else:
                ratio = _hour_overlap(campaign_utc, rep_utc)
                breakdown["working_hours"] = round(WEIGHTS["working_hours"] * ratio)
                reasons.append(f"Working-hours overlap is {round(ratio * 100):d}%")

        return {
            "score": sum(breakdown.values()), "breakdown": breakdown,
            "reasons": reasons, "warnings": warnings,
            "capacity": {"current_load": load, "capacity": capacity, "utilization_percentage": utilization},
        }
