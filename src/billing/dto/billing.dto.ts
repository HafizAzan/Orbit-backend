import { IsOptional, IsBoolean, IsString, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListInvoicesQueryDto extends PaginationQueryDto {}

export class CreateCheckoutDto {
  @IsString()
  @MinLength(3)
  priceId: string;
}

export class CancelPlanDto {
  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;
}

export class ChangePlanDto {
  @IsString()
  @MinLength(3)
  priceId: string;
}

export class RefundPaymentDto {
  @IsOptional()
  @IsString()
  invoiceId?: string;
}

export class ConfirmCheckoutDto {
  @IsString()
  @MinLength(3)
  sessionId: string;
}

export class CreatePortalSessionDto {
  @IsOptional()
  @IsString()
  returnUrl?: string;
}
