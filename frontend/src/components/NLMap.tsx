import { useEffect, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip,
  useMap,
} from 'react-leaflet';
import { useQuery } from '@tanstack/react-query';
import { fetchBriefs } from '../api/briefs';
import { rankPortfolio } from '../api/portfolio';
import { useStore } from '../state/store';
import { fmtMillions } from '../lib/format';
import { BackendError } from './BackendError';

const NL_CENTER: [number, number] = [53.0, -58.0];
const NL_ZOOM = 5;

/**
 * Keeps Leaflet's internal size in sync when the map's container changes size
 * — e.g. when the user drags the panel divider or collapses the chat panel.
 * Without this, a resized map shows gray tiles until the next interaction.
 */
function ResizeInvalidator() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

export function NLMap() {
  const budgetCad = useStore((s) => s.budgetCad);
  const weightDollar = useStore((s) => s.weightDollar);
  const weightCo2 = useStore((s) => s.weightCo2);
  const weightEquity = useStore((s) => s.weightEquity);
  const selectedId = useStore((s) => s.selectedId);
  const setSelectedId = useStore((s) => s.setSelectedId);

  const {
    data: briefs,
    isError: briefsError,
    isFetching: briefsFetching,
    refetch: refetchBriefs,
  } = useQuery({
    queryKey: ['briefs'],
    queryFn: fetchBriefs,
  });

  const { data: ranking } = useQuery({
    queryKey: ['rank', budgetCad, weightDollar, weightCo2, weightEquity],
    queryFn: () =>
      rankPortfolio({
        budget_cad: budgetCad,
        weight_dollar: weightDollar,
        weight_co2: weightCo2,
        weight_equity: weightEquity,
      }),
    placeholderData: (prev) => prev,
  });

  const fundableById = useMemo(() => {
    if (!ranking) return new Map<string, boolean>();
    return new Map(ranking.ranked.map((r) => [r.id, r.fundable]));
  }, [ranking]);

  if (!briefs) {
    if (briefsError) {
      return (
        <BackendError
          onRetry={() => refetchBriefs()}
          isRetrying={briefsFetching}
          label="map"
        />
      );
    }
    return (
      <div className="h-full flex items-center justify-center text-slate-400 text-sm">
        Loading map…
      </div>
    );
  }

  return (
    <MapContainer
      center={NL_CENTER}
      zoom={NL_ZOOM}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom
      zoomControl
      className="z-0"
    >
      <ResizeInvalidator />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {briefs.communities.map((c) => {
        const isFundable = fundableById.get(c.id) ?? false;
        const isSelected = selectedId === c.id;
        return (
          <CircleMarker
            key={c.id}
            center={[c.lat, c.lon]}
            radius={isSelected ? 14 : isFundable ? 10 : 7}
            pathOptions={{
              color: isSelected ? '#1a4a8b' : isFundable ? '#059669' : '#94a3b8',
              fillColor: isSelected
                ? '#1a4a8b'
                : isFundable
                  ? '#10b981'
                  : '#cbd5e1',
              fillOpacity: isSelected ? 0.95 : 0.75,
              weight: isSelected ? 3 : 2,
            }}
            eventHandlers={{ click: () => setSelectedId(c.id) }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              <div className="text-xs leading-tight">
                <div className="font-semibold">{c.name}</div>
                <div className="text-slate-500">{c.region}</div>
                <div className="font-mono mt-0.5">
                  {fmtMillions(c.economics.capital_cost_cad.point)} ·{' '}
                  {c.economics.payback_years}y
                </div>
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
