import { redirect } from 'next/navigation';
import { EmailVerificationBanner } from '@/components/account/email-verification-banner';
import { Landing } from '@/components/home/landing';
import { MemberHome } from '@/components/home/member-home';
import { getCurrentUser } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { listOpportunities } from '@/lib/api/opportunities';
import type { OpportunityItem } from '@/lib/api/types';
import { listWatches } from '@/lib/api/watches';

/** PG-01/PG-02: promoções são um complemento da home — se o feed falhar, a página continua. */
async function safeOpportunities(): Promise<OpportunityItem[]> {
  try {
    return await listOpportunities({ sort: 'best_value' });
  } catch {
    return [];
  }
}

/**
 * Visitante: landing com promoções ao vivo (PG-01). Com sessão: início
 * institucional do app; os monitoramentos ficam em `/watches`.
 */
export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) {
    return <Landing opportunities={await safeOpportunities()} />;
  }

  let watches;
  try {
    watches = await listWatches();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }
    throw error;
  }
  const opportunities = await safeOpportunities();

  const active = watches.filter((watch) => watch.status === 'ACTIVE' || watch.status === 'PAUSED');
  const reachedTarget = watches.filter(
    (watch) =>
      watch.status === 'ACTIVE' &&
      watch.targetAmountMinor !== null &&
      watch.currentPrice !== null &&
      watch.currentPrice.amountMinor <= watch.targetAmountMinor,
  ).length;

  return (
    <>
      {!user.notificationChannelVerified && (
        <div className="container">
          <EmailVerificationBanner />
        </div>
      )}
      <MemberHome
        userEmail={user.email}
        notificationChannelVerified={user.notificationChannelVerified}
        opportunities={opportunities}
        monitoredCount={active.length}
        targetReachedCount={reachedTarget}
        currentOfferCount={active.filter((watch) => watch.currentOffer !== null).length}
      />
    </>
  );
}
