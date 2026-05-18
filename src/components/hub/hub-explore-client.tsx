"use client";
type Props = {
  items: unknown[];
  total: number;
  page: number;
  perPage: number;
  initialFilters: Record<string, unknown>;
  basePath: string;
};
export function HubExploreClient(_: Props) { return <div data-testid="hub-explore" /> }
