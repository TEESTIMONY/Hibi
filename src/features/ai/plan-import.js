import { getProjectTag } from '../../domain/tasks.js';

export function createTasksFromPlan(plan, selected, project, createId = () => crypto.randomUUID()) {
  const sourceNames = new Map(plan.sources.map((source) => [source.id, source.name]));
  return plan.tasks.filter((_, index) => selected.has(index)).map((suggestion) => {
    const references = suggestion.sourceIds.map((id) => sourceNames.get(id)).filter(Boolean);
    const details = [
      suggestion.notes,
      suggestion.dueDate ? `Suggested deadline: ${suggestion.dueDate}` : '',
      suggestion.estimatedMinutes ? `Estimated effort: ${suggestion.estimatedMinutes} minutes` : '',
      `From AI plan: ${plan.title}`,
      references.length ? `Sources: ${references.join(', ')}` : '',
    ].filter(Boolean);
    return {
      id: createId(), title: suggestion.title.trim(), notes: details.join('\n\n'),
      project, tag: getProjectTag(project), when: suggestion.when,
      dueDate: suggestion.dueDate, priority: suggestion.priority,
      estimatedMinutes: suggestion.estimatedMinutes,
      checks: suggestion.checklist.map((text) => ({ text, done: false })),
      done: false, origin: 'ai-plan',
    };
  });
}
