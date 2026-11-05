"""Conservative English action extraction, with source evidence and no model calls."""
import re
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

VERBS = r"send|submit|call|email|buy|book|pay|finish|complete|review|prepare|write|read|study|practice|schedule|update|check|collect|upload|download|renew|apply|meet|visit|clean|organize|pack|reply|contact|research|design|build|test|fix|print|sign|register|cancel|pick up|follow up"
PREFIX = re.compile(r"^(?:(?:please|kindly)\s+|(?:i|we|you)\s+(?:need to|have to|must|will)\s+|(?:can|could|would) you\s+(?:please\s+)?|remind me to\s+|(?:todo|to-do|task)\s*:\s*)*", re.I)
ACTION = re.compile(rf"^(?:{VERBS})\b", re.I)
NEGATIVE = re.compile(r"\b(?:don't|do not|won't|not|already|done|completed|cancelled|canceled|no longer|if|unless|maybe|might)\b", re.I)
WEEKDAYS = {name: index for index, name in enumerate(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])}


def extract_tasks(text, time_zone="Africa/Lagos", now=None):
    today = (now or datetime.now(timezone.utc)).astimezone(ZoneInfo(time_zone)).date()
    suggestions = []
    seen = set()
    skipped = 0
    for line in re.split(r"\n|;|(?<=[.!?])\s+", text):
        source = line.strip()
        if not source:
            continue
        value = re.sub(r"^(?:[-*•]|\d+[.)])\s*", "", source).replace('’', "'")
        value = re.sub(r"^\[[^\]\n]{1,80}\]\s*", "", value)
        speaker = re.match(r"^([A-Za-z][A-Za-z'-]*(?: [A-Za-z][A-Za-z'-]*){0,2}):\s*", value)
        if speaker and speaker.group(1).lower() not in {"todo", "to-do", "task"}:
            value = value[speaker.end():]
        else:
            speaker = None
        action = PREFIX.sub("", value).strip()
        if NEGATIVE.search(value) or not ACTION.match(action):
            skipped += 1
            continue
        key = re.sub(r"\s+", " ", action).rstrip('.!?').lower()
        if key in seen:
            continue
        seen.add(key)
        warnings = []
        if speaker:
            warnings.append("Check who is responsible; the message mentions a speaker.")
        dates = []
        relative = False
        for match in re.finditer(r"\b\d{4}-\d{2}-\d{2}\b", action):
            try:
                dates.append(date.fromisoformat(match.group()))
            except ValueError:
                warnings.append("The date is invalid. Choose a date yourself.")
        for match in re.finditer(r"\b(today|tomorrow|(?:(?:next|this)\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b", action, re.I):
            word = match.group().lower()
            relative = True
            if word in {"today", "tomorrow"}:
                dates.append(today + timedelta(days=word == "tomorrow"))
            else:
                weekday = word.split()[-1]
                offset = (WEEKDAYS[weekday] - today.weekday()) % 7
                if word.startswith("next ") and offset == 0:
                    offset = 7
                dates.append(today + timedelta(days=offset))
                warnings.append("Check the weekday date, especially in forwarded messages.")
        if relative:
            warnings.append(f"Relative dates use {today.isoformat()} in {time_zone}; check the original message date.")
        if re.search(r"\b(?:next week|weekend|later|soon|morning|afternoon|evening)\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b", re.sub(r"\b\d{4}-\d{2}-\d{2}\b", "", action), re.I):
            warnings.append("Some date or time wording needs your clarification.")
        unique_dates = sorted(set(dates))
        chosen_date = unique_dates[0].isoformat() if len(unique_dates) == 1 else None
        if len(unique_dates) > 1:
            warnings.append("Several dates were mentioned. Choose the correct date.")
        if chosen_date and chosen_date < today.isoformat():
            warnings.append("This date has passed. Check whether the task is still needed.")
        deadline = bool(re.search(r"\b(?:by|before|due|deadline)\b", action, re.I))
        durations = []
        for match in re.finditer(r"\b(\d{1,4}(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)\b", action, re.I):
            if re.search(r"\bin\s*$", action[:match.start()], re.I):
                warnings.append("A relative start time was mentioned. Choose a time yourself.")
                continue
            amount = float(match[1]) * (60 if match[2].lower().startswith(('h',)) else 1)
            if amount.is_integer() and 1 <= amount <= 1440:
                durations.append(int(amount))
            else:
                warnings.append("Choose a duration between 1 and 1,440 minutes.")
        duration = durations[0] if len(durations) == 1 else None
        if len(durations) > 1:
            warnings.append("Several durations were mentioned. Choose an estimate.")
        if not duration:
            warnings.append("Add a duration estimate before fitting this task into a schedule.")
        clock = None
        clocks = []
        for match in re.finditer(r"\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\bat\s+(\d{1,2}):(\d{2})\b", action, re.I):
            hour, minute = int(match[1] or match[4]), int(match[2] or match[5] or 0)
            meridian = (match[3] or '').lower()
            if minute > 59 or (meridian and not 1 <= hour <= 12) or (not meridian and hour > 23):
                warnings.append("The clock time is invalid. Choose it yourself.")
                continue
            if meridian:
                hour = hour % 12 + (12 if meridian == 'pm' else 0)
            clocks.append(f"{hour:02d}:{minute:02d}")
        if len(clocks) == 1:
            clock = clocks[0]
            warnings.append("Time mentioned: " + clock + ". It will stay in the source note; set a fixed time in the task editor if needed.")
        elif len(clocks) > 1:
            warnings.append("Several clock times were mentioned; review the source.")
        if re.search(rf"\band\s+(?:{VERBS})\b", action, re.I):
            warnings.append("This may contain multiple actions. Split or edit it before adding.")
        priority = "high" if re.search(r"\b(?:urgent|high priority)\b", action, re.I) else "medium"
        suggestions.append({"title": action.rstrip('.!?')[:500], "source": source,
                            "scheduledDate": chosen_date if not deadline else None,
                            "dueDate": chosen_date if deadline else None, "durationMinutes": duration,
                            "priority": priority, "mentionedTime": clock, "warnings": list(dict.fromkeys(warnings))})
        if len(suggestions) == 100:
            break
    return {"suggestions": suggestions, "skippedLines": skipped,
            "message": "Review every suggestion (up to 100 per paste). This parser recognises clear English actions; it does not understand a whole conversation."}
