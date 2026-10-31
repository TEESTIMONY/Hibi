from rest_framework.test import APITestCase
from . import test_workspace


class SchedulingTests(APITestCase):
    setUp = test_workspace.WorkspaceTests.setUp

    def test_schedule_round_trip_and_clearing(self):
        task = self.payload['tasks'][0]
        task.update(scheduledDate='2026-11-04', startTime='09:30', durationMinutes=45, timeZone='Africa/Lagos')
        response = self.client.put('/api/workspace', self.payload, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        saved = self.client.get('/api/workspace').data['tasks'][0]
        for key in ['scheduledDate', 'startTime', 'durationMinutes', 'timeZone']:
            self.assertEqual(saved[key], task[key])
        task.update(scheduledDate=None, startTime=None, durationMinutes=None)
        self.payload['revision'] = 1
        self.assertEqual(self.client.put('/api/workspace', self.payload, format='json').status_code, 200)
        self.assertIsNone(self.client.get('/api/workspace').data['tasks'][0]['scheduledDate'])

    def test_invalid_schedules_are_rejected_without_writes(self):
        base = self.payload['tasks'][0].copy()
        cases = [dict(scheduledDate='2026-02-30'), dict(timeZone='Invalid/Zone'),
                 dict(startTime='25:00'), dict(startTime='09:30'),
                 dict(scheduledDate='2026-11-01', startTime='09:30', durationMinutes=0),
                 dict(scheduledDate='2026-03-08', startTime='02:30', durationMinutes=30, timeZone='America/New_York')]
        for fields in cases:
            self.payload['tasks'] = [{**base, **fields}]
            response = self.client.put('/api/workspace', self.payload, format='json')
            self.assertEqual(response.status_code, 400, (fields, response.data))
