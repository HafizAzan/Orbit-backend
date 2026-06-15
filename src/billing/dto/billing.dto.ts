import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

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
