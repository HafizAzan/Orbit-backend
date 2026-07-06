import { DashboardPeriod } from './dto/dashboard-query.dto';

export type DashboardDateRange = {
  from: Date;
  to: Date;
};

export function getDashboardPeriodRange(
  period: DashboardPeriod = DashboardPeriod.THIS_MONTH,
): DashboardDateRange {
  const to = new Date();
  to.setHours(23, 59, 59, 999);

  const from = new Date();
  from.setHours(0, 0, 0, 0);

  switch (period) {
    case DashboardPeriod.TODAY:
      break;
    case DashboardPeriod.THIS_WEEK: {
      const day = from.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      from.setDate(from.getDate() + diff);
      break;
    }
    case DashboardPeriod.THIS_MONTH:
      from.setDate(1);
      break;
    case DashboardPeriod.LAST_6_MONTHS:
      from.setMonth(from.getMonth() - 5, 1);
      break;
    case DashboardPeriod.THIS_YEAR:
      from.setMonth(0, 1);
      break;
    default:
      from.setDate(1);
  }

  return { from, to };
}

export function isDateWithinRange(date: Date, range: DashboardDateRange) {
  return date >= range.from && date <= range.to;
}

export function isTaskRelevantInPeriod(
  task: { createdAt: Date; updatedAt: Date; dueDate?: string | null },
  range: DashboardDateRange,
) {
  if (isDateWithinRange(task.updatedAt, range)) {
    return true;
  }

  if (isDateWithinRange(task.createdAt, range)) {
    return true;
  }

  if (task.dueDate) {
    const due = new Date(`${task.dueDate}T12:00:00`);
    if (isDateWithinRange(due, range)) {
      return true;
    }
  }

  return false;
}

export function isProjectRelevantInPeriod(
  project: { updatedAt: Date; id?: string },
  range: DashboardDateRange,
  projectIdsWithTasks: Set<string>,
) {
  if (isDateWithinRange(project.updatedAt, range)) {
    return true;
  }

  return projectIdsWithTasks.has((project?.id as string) ?? '');
}
