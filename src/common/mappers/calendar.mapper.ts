import type { CalendarEvent } from '../../entities/calendar-event.entity';
import type { Project } from '../../entities/project.entity';
import type { Task } from '../../entities/task.entity';
import { CalendarEventType } from '../../enum/calendar.enum';
import { TaskPriority } from '../../enum/task.enum';

export type CalendarEventResponse = {
  id: string;
  title: string;
  date: string;
  type: 'task' | 'team' | 'deadline';
  projectId?: string;
  description?: string;
  source: 'event' | 'task' | 'project';
  createdById?: string;
};

export function mapCalendarEventRecord(
  event: CalendarEvent,
): CalendarEventResponse {
  return {
    id: event.id,
    title: event.title,
    date: event.date,
    type: event.type,
    projectId: event.projectId ?? undefined,
    description: event.description || undefined,
    source: 'event',
    createdById: event.createdById,
  };
}

export function mapTaskToCalendarEvent(task: Task): CalendarEventResponse {
  const isDeadline =
    task.priority === TaskPriority.CRITICAL ||
    task.priority === TaskPriority.HIGH;

  return {
    id: `task-${task.id}`,
    title: task.title,
    date: task.dueDate!,
    type: isDeadline ? 'deadline' : 'task',
    projectId: task.projectId,
    source: 'task',
  };
}

export function mapProjectDueDateToCalendarEvent(
  project: Project,
): CalendarEventResponse {
  return {
    id: `project-${project.id}`,
    title: `${project.name} deadline`,
    date: project.dueDate!,
    type: CalendarEventType.DEADLINE,
    projectId: project.id,
    source: 'project',
  };
}
