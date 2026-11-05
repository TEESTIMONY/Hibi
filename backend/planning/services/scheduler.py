"""Deterministic first-fit planning. No external models or network calls."""
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

UTC = timezone.utc


def local_instant(day, clock, zone):
    value = datetime.combine(day, clock).replace(tzinfo=zone)
    # Reject nonexistent wall times at DST transitions rather than shift silently.
    if value.astimezone(UTC).astimezone(zone).replace(tzinfo=None) != value.replace(tzinfo=None):
        raise ValueError("An availability time does not exist on this date in the chosen timezone.")
    return value.astimezone(UTC)


def propose_schedule(tasks, *, start_date, days, start_time, end_time, time_zone, selected, break_minutes=5, now=None):
    now = now or datetime.now(UTC)
    zone = ZoneInfo(time_zone)
    if start_date < now.astimezone(zone).date():
        raise ValueError("Choose today or a future start date.")
    if start_time >= end_time:
        raise ValueError("Available hours must end after they start. Overnight availability is not supported yet.")
    windows = []
    for offset in range(days):
        day = start_date + timedelta(days=offset)
        begin = max(local_instant(day, start_time, zone), now)
        # Round up to the next minute so proposals never begin in the past.
        if begin.second or begin.microsecond:
            begin = begin.replace(second=0, microsecond=0) + timedelta(minutes=1)
        finish = local_instant(day, end_time, zone)
        if begin < finish:
            windows.append((begin, finish))
    busy = []
    warnings = []
    pinned = set()
    for task in tasks:
        if task.get("done") or not all(task.get(key) for key in ("scheduledDate", "startTime", "durationMinutes")):
            continue
        task_zone = ZoneInfo(task.get("timeZone") or time_zone)
        start = local_instant(datetime.fromisoformat(task["scheduledDate"]).date(), time.fromisoformat(task["startTime"]), task_zone)
        finish = start + timedelta(minutes=task["durationMinutes"])
        if start >= now:
            busy.append((start, finish))
            pinned.add(str(task["id"]))
        # Past unfinished slots can be explicitly selected for replanning.
        elif finish > now:
            busy.append((start, finish))
            pinned.add(str(task["id"]))
    ordered_busy = sorted(busy)
    latest_end = None
    for start, finish in ordered_busy:
        if latest_end and start < latest_end:
            warnings.append("Some existing time slots overlap. They were kept unchanged.")
            break
        latest_end = max(latest_end, finish) if latest_end else finish
    task_map = {str(task["id"]): task for task in tasks}
    pending = []
    skipped = []
    for item in selected:
        task = task_map[item["id"]]
        if task.get("done"):
            skipped.append({"id": item["id"], "reason": "Already completed."})
            continue
        if item["id"] in pinned:
            skipped.append({"id": item["id"], "reason": "Kept your existing time slot."})
            continue
        duration = item.get("durationMinutes") or task.get("durationMinutes") or task.get("estimatedMinutes")
        if not duration:
            skipped.append({"id": item["id"], "reason": "Add a duration estimate first."})
            continue
        task_zone = ZoneInfo(task.get("timeZone") or time_zone)
        due = datetime.fromisoformat(task["dueDate"]).date() if task.get("dueDate") else None
        # A deadline means end-of-day in the task's own timezone.
        cutoff = local_instant(due + timedelta(days=1), time(0), task_zone) if due else datetime.max.replace(tzinfo=UTC)
        earliest = windows[0][0] if windows else now
        if task.get("scheduledDate"):
            day = datetime.fromisoformat(task["scheduledDate"]).date()
            earliest = max(earliest, local_instant(day, time(0), task_zone))
        elif task.get("when") == "Tomorrow":
            day = now.astimezone(task_zone).date() + timedelta(days=1)
            earliest = max(earliest, local_instant(day, time(0), task_zone))
        if task.get("when") == "This Evening":
            day = max(start_date, now.astimezone(task_zone).date())
            earliest = max(earliest, local_instant(day, time(18), task_zone))
        priority = item.get("priority", task.get("priority", "medium"))
        pending.append((cutoff, {"high": 0, "medium": 1, "low": 2}[priority], item["id"], task, duration, earliest, priority))
    proposals = []
    for cutoff, _, task_id, task, duration, earliest, priority in sorted(pending, key=lambda value: (value[0], value[1], value[2])):
        length = timedelta(minutes=duration)
        placed = None
        for begin, end in windows:
            candidate = max(begin, earliest)
            for occupied_start, occupied_end in sorted(busy):
                if occupied_end <= candidate:
                    continue
                if occupied_start >= candidate + length:
                    break
                candidate = max(candidate, occupied_end)
            if candidate + length <= min(end, cutoff):
                placed = candidate
                break
        if placed is None:
            reason = "Deadline has already passed. Choose a new deadline." if cutoff <= now else "No uninterrupted space before the deadline or within your available hours."
            skipped.append({"id": task_id, "reason": reason})
            continue
        output_zone = task.get("timeZone") or time_zone
        local = placed.astimezone(ZoneInfo(output_zone))
        if local.fold:
            skipped.append({"id": task_id, "reason": "This slot has an ambiguous clock time during a timezone change. Choose different available hours."})
            continue
        proposals.append({"id": task_id, "scheduledDate": local.date().isoformat(), "startTime": local.strftime("%H:%M"),
                          "durationMinutes": duration, "timeZone": output_zone, "priority": priority,
                          "reason": "Earliest free slot before your deadline." if task.get("dueDate") else "Earliest free slot within your available hours."})
        busy.append((placed, placed + length + timedelta(minutes=break_minutes)))
    proposals.sort(key=lambda item: local_instant(date_from_iso(item["scheduledDate"]), time.fromisoformat(item["startTime"]), ZoneInfo(item["timeZone"])))
    return {"proposals": proposals, "unplanned": skipped, "warnings": warnings,
            "plannedMinutes": sum(item["durationMinutes"] for item in proposals)}


def date_from_iso(value):
    return datetime.fromisoformat(value).date()
