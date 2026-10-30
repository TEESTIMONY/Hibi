const string = { type: 'string' };
const strings = { type: 'array', items: string };

export const PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'summary', 'assumptions', 'questions', 'tasks'],
  properties: {
    title: string, summary: string, assumptions: strings, questions: strings,
    tasks: {
      type: 'array', maxItems: 30,
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'notes', 'when', 'dueDate', 'priority', 'estimatedMinutes', 'checklist', 'sourceIds'],
        properties: {
          title: string, notes: string,
          when: { type: 'string', enum: ['Today', 'This Evening', 'Tomorrow', 'Anytime', 'Someday', 'Inbox'] },
          dueDate: { type: ['string', 'null'] },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          estimatedMinutes: { type: ['integer', 'null'] },
          checklist: strings, sourceIds: strings,
        },
      },
    },
  },
};

export function validatePlan(plan, sourceIds) {
  if (!plan || typeof plan.title !== 'string' || typeof plan.summary !== 'string'
    || !plan.title.trim() || plan.title.length > 300 || plan.summary.length > 6000
    || !Array.isArray(plan.tasks) || plan.tasks.length > 30) throw new Error('Invalid plan returned by the model.');
  const validStrings = (list) => Array.isArray(list) && list.length <= 50
    && list.every((item) => typeof item === 'string' && item.length <= 5000);
  if (!validStrings(plan.assumptions) || !validStrings(plan.questions)) throw new Error('Invalid plan explanations.');
  for (const task of plan.tasks) {
    if (typeof task.title !== 'string' || !task.title.trim() || task.title.length > 300
      || typeof task.notes !== 'string' || task.notes.length > 6000
      || !['Today', 'This Evening', 'Tomorrow', 'Anytime', 'Someday', 'Inbox'].includes(task.when)
      || !['low', 'medium', 'high'].includes(task.priority)
      || !(task.dueDate === null || (typeof task.dueDate === 'string'
        && /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)
        && !Number.isNaN(Date.parse(task.dueDate))
        && new Date(task.dueDate).toISOString().slice(0, 10) === task.dueDate))
      || !(task.estimatedMinutes === null || (Number.isInteger(task.estimatedMinutes) && task.estimatedMinutes > 0 && task.estimatedMinutes <= 10080))
      || !validStrings(task.checklist) || !validStrings(task.sourceIds)
      || !task.sourceIds.length || task.sourceIds.some((id) => !sourceIds.includes(id))) {
      throw new Error('Invalid suggested task returned by the model.');
    }
  }
  return plan;
}
