import { Global, Module } from '@nestjs/common';
import { OrganizationAdminGuard } from './guards/organization-admin.guard';
import { OrganizationBillingGuard } from './guards/organization-billing.guard';
import { OrganizationMemberGuard } from './guards/organization-member.guard';
import { OrganizationOwnerGuard } from './guards/organization-owner.guard';
import { OrganizationSubscriptionActiveGuard } from './guards/organization-subscription-active.guard';

@Global()
@Module({
  providers: [
    OrganizationMemberGuard,
    OrganizationAdminGuard,
    OrganizationOwnerGuard,
    OrganizationBillingGuard,
    OrganizationSubscriptionActiveGuard,
  ],
  exports: [
    OrganizationMemberGuard,
    OrganizationAdminGuard,
    OrganizationOwnerGuard,
    OrganizationBillingGuard,
    OrganizationSubscriptionActiveGuard,
  ],
})
export class OrganizationGuardsModule {}
