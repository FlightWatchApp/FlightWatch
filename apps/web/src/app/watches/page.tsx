import { redirect } from 'next/navigation';
import { EmailVerificationBanner } from '@/components/account/email-verification-banner';
import { Dashboard } from '@/components/dashboard';
import { getCurrentUser } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { listOpportunities } from '@/lib/api/opportunities';
import type { OpportunityItem } from '@/lib/api/types';
import { getWatch, listWatches } from '@/lib/api/watches';
import { pickHighlightWatch } from '@/lib/domain/watch-price';

async function safeOpportunities(): Promise<OpportunityItem[]> {
  try {
    return await listOpportunities({ sort: 'best_value' });
  } catch {
    return [];
  }
}

/** Área de monitoramentos do usuário — separada da tela institucional inicial. */
export default async function WatchesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
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
  const highlightSummary = pickHighlightWatch(watches);
  const highlight = highlightSummary ? await getWatch(highlightSummary.id) : null;
  const monitoredRoutes = new Set(watches.map((watch) => `${watch.origin}-${watch.destination}`));
  const personalizedDeals = opportunities
    .filter((opportunity) =>
      monitoredRoutes.has(`${opportunity.origin}-${opportunity.destination}`),
    )
    .slice(0, 3);

  return (
    <>
      {!user.notificationChannelVerified && (
        <div className="container">
          <EmailVerificationBanner />
        </div>
      )}
      <Dashboard
        userEmail={user.email}
        highlight={highlight}
        promotions={personalizedDeals}
        monitoring={active}
        stats={{
          monitoredCount: active.length,
          targetReachedCount: reachedTarget,
          currentOfferCount: active.filter((watch) => watch.currentOffer !== null).length,
        }}
      />
    </>
  );
}
