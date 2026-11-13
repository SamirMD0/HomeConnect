import { useState } from 'react';
import { Redirect, Stack, useRouter } from 'expo-router';
import { REPORT_CATALOG } from '@shared/report-catalog';
import { collectionPage } from '../pagination';
import { useLookup, useLookupPages } from '../useLookup';
import { LookupList } from '../LookupList';
import { SearchBar } from '../../components/SearchBar';
import { ListRow } from '../../components/ListRow';
export function ReportsScreen() {
  const { key, session } = useLookup(),
    router = useRouter();
  const [search, setSearch] = useState('');
  const reports = useLookupPages(
    key('report-catalog', { search }),
    async (page) =>
      collectionPage(
        REPORT_CATALOG.filter((r) =>
          `${r.title} ${r.category}`.toLowerCase().includes(search.toLowerCase())
        ),
        page
      ),
    session.can('reports.read')
  );
  if (!session.can('reports.read')) return <Redirect href="/(tabs)/more" />;
  return (
    <>
      <Stack.Screen options={{ title: 'Reports' }} />
      <LookupList
        title="Reports"
        query={reports}
        itemKey={(item) => item.id}
        header={<SearchBar label="Search reports" value={search} onChangeText={setSearch} />}
        renderItem={(report) => (
          <ListRow
            title={report.title}
            subtitle={report.description}
            onPress={() =>
              router.push({ pathname: '/(tabs)/more/report/[id]', params: { id: report.id } })
            }
          />
        )}
      />
    </>
  );
}
