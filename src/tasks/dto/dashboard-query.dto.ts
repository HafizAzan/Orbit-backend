import { IsEnum, IsOptional } from 'class-validator';

export enum DashboardPeriod {
  TODAY = 'today',
  THIS_WEEK = 'this_week',
  THIS_MONTH = 'this_month',
  LAST_6_MONTHS = 'last_6_months',
  THIS_YEAR = 'this_year',
}

export class DashboardQueryDto {
  @IsOptional()
  @IsEnum(DashboardPeriod)
  period?: DashboardPeriod = DashboardPeriod.THIS_MONTH;
}
