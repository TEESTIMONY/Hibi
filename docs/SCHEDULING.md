# Scheduling: dates and manual time slots

Each task can now store scheduledDate (YYYY-MM-DD), startTime (HH:MM), durationMinutes (1–1440), timeZone (IANA name), and an optional dueDate deadline. These fields travel through the existing revision-protected workspace endpoint and are stored in each task's validated JSON document. No new table migration is required.

Open a task and use the Schedule section. A date without a start time is a day plan. A start time requires a date and duration. Choosing Today, This Evening, or Tomorrow while leaving the date blank anchors the task to a real date when saved. Changing When clears the explicit date; alternatively, an explicit date overrides the relative label. Existing undated legacy tasks keep their labels until edited. Accepted AI suggestions for Today/Tomorrow are anchored at import time.

Today includes scheduled work for today and unfinished overdue tasks. Completed past tasks remain in Logbook. Upcoming includes all future scheduled dates, ordered by date and local start time. Comparisons use each task's timezone, defaulting to Africa/Lagos. A deadline alone does not allocate a work slot.

Today's schedule displays actual saved time slots instead of sample calendar events. Each slot shows its own timezone. An end time after midnight displays +1 day. Slots in different timezones are not yet combined into a single converted timeline; they retain their entered wall-clock times. The mobile planner also displays the schedule beneath the task list.

Django validates real dates, IANA zones, minute precision, duration bounds, and required slot fields. A local time skipped by a daylight-saving transition is rejected. During a repeated fall-back hour, the first occurrence is used; there is no fold selector yet. Durations currently display as wall-clock minutes; advanced elapsed-time behavior across daylight-saving transitions is not implemented.

This stage is manual scheduling. Working hours, overlap detection, reminders, repeating tasks, external calendar synchronization, automatic time allocation, and rescheduling suggestions are future stages. No AWS resources have been created.

Verification covers date boundaries, timezone differences, overdue visibility, anchoring relative labels, invalid values, daylight-saving gaps, clearing slots, and API persistence. Run npm test and backend/.venv/Scripts/python.exe backend/manage.py test planning.
