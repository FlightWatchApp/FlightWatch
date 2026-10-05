import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api/client';
import { getFlightSearch } from '@/lib/api/searches';
import { SearchResults } from '../search-results';

export default async function SearchResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let search;
  try {
    search = await getFlightSearch(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="container">
      <SearchResults search={search} />
    </div>
  );
}
