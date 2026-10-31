import copy
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase
from .models import Workspace, Task, Project


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class WorkspaceTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.owner = get_user_model().objects.create_user('owner', password='test-only-password')
        self.client.force_authenticate(self.owner)
        self.payload = {'revision': 0, 'projects': ['Personal'], 'tasks': [
            {'id': 1, 'title': 'Read', 'project': 'Personal', 'when': 'Today', 'notes': 'Chapter two',
             'done': True, 'checks': [{'text': 'Find book', 'done': True}],
             'dueDate': '2026-12-01', 'priority': 'medium', 'estimatedMinutes': 30}]}

    def test_round_trip_preserves_notes_checklists_and_ai_fields(self):
        response = self.client.put('/api/workspace', self.payload, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['revision'], 1)
        state = self.client.get('/api/workspace').data
        self.assertEqual(state['tasks'][0]['id'], '1')
        for field in ['notes', 'checks', 'done', 'dueDate', 'priority', 'estimatedMinutes']:
            self.assertEqual(state['tasks'][0][field], self.payload['tasks'][0][field])
        self.assertEqual(Task.objects.count(), 1)

    def test_users_are_isolated_and_anonymous_cannot_access(self):
        self.client.put('/api/workspace', self.payload, format='json')
        other = get_user_model().objects.create_user('other')
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get('/api/workspace').data['tasks'], [])
        self.client.put('/api/workspace', {'revision': 0, 'tasks': [], 'projects': []}, format='json')
        self.assertEqual(Task.objects.count(), 1)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/workspace').status_code, 401)
        self.assertEqual(self.client.put('/api/workspace', self.payload, format='json').status_code, 401)

    def test_stale_update_returns_conflict_without_deleting_data(self):
        self.client.put('/api/workspace', self.payload, format='json')
        stale = {'revision': 0, 'tasks': [], 'projects': []}
        self.assertEqual(self.client.put('/api/workspace', stale, format='json').status_code, 409)
        self.assertEqual(Task.objects.count(), 1)
        self.assertEqual(Workspace.objects.get(user=self.owner).revision, 1)

    def test_update_and_delete_are_atomic_and_ordered(self):
        self.client.put('/api/workspace', self.payload, format='json')
        changed = copy.deepcopy(self.payload)
        changed['revision'] = 1
        changed['tasks'][0]['title'] = 'Edited'
        changed['projects'] = ['Work', 'Personal']
        self.assertEqual(self.client.put('/api/workspace', changed, format='json').status_code, 200)
        state = self.client.get('/api/workspace').data
        self.assertEqual(state['projects'], ['Work', 'Personal'])
        self.assertEqual(state['tasks'][0]['title'], 'Edited')
        self.assertEqual(self.client.put('/api/workspace', {'revision': 2, 'projects': [], 'tasks': []}, format='json').status_code, 200)
        self.assertFalse(Task.objects.exists())
        self.assertFalse(Project.objects.exists())

    def test_invalid_tasks_never_replace_saved_state(self):
        self.client.put('/api/workspace', self.payload, format='json')
        for patch in [{'when': 'Yesterday'}, {'project': 'Someone else'}, {'dueDate': '2026-02-30'},
                      {'checks': [{'done': True}]}, {'title': ''}]:
            body = copy.deepcopy(self.payload)
            body['revision'] = 1
            body['tasks'][0].update(patch)
            self.assertEqual(self.client.put('/api/workspace', body, format='json').status_code, 400)
            self.assertEqual(Workspace.objects.get(user=self.owner).revision, 1)

    def test_duplicate_ids_and_projects_are_rejected(self):
        body = copy.deepcopy(self.payload)
        body['tasks'].append(copy.deepcopy(body['tasks'][0]))
        self.assertEqual(self.client.put('/api/workspace', body, format='json').status_code, 400)
        body = copy.deepcopy(self.payload)
        body['projects'].append('Personal')
        self.assertEqual(self.client.put('/api/workspace', body, format='json').status_code, 400)

    def test_registration_password_validation_and_identity(self):
        self.client.force_authenticate(None)
        weak = self.client.post('/api/auth/register', {'username': 'new-person', 'password': '123'}, format='json')
        self.assertEqual(weak.status_code, 400)
        result = self.client.post('/api/auth/register', {'username': 'new-person', 'password': 'Synthetic-test-strong-74!'}, format='json')
        self.assertEqual(result.status_code, 201, result.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {result.data['token']}")
        self.assertEqual(self.client.get('/api/auth/me').data['username'], 'new-person')
        self.assertEqual(self.client.get('/api/workspace').data['tasks'], [])
        duplicate = self.client.post('/api/auth/register', {'username': 'new-person', 'password': 'Synthetic-test-strong-74!'}, format='json')
        self.assertEqual(duplicate.status_code, 400)
