import { Repository } from 'typeorm';
import { Subscription } from '../entities/subscription.entity';

export async function isOrganizationSubscriptionActive(
  subscriptionRepository: Repository<Subscription>,
  organizationId: string | null | undefined,
) {
  if (!organizationId) {
    return true;
  }

  const subscription = await subscriptionRepository.findOne({
    where: { organizationId },
  });

  if (!subscription) {
    return false;
  }

  return subscription.planSelectedAt != null;
}
