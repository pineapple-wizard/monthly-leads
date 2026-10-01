export const REGIONS = ["Texas", "Illinois", "Tennessee", "Puerto Rico"] as const;

export type Region = (typeof REGIONS)[number];

export type VenueType = "hotel" | "restaurant" | "nightclub" | "bar";

export type VenueStatus =
  | "planned"
  | "under_construction"
  | "renovation"
  | "conversion"
  | "opening_soon"
  | "opened";

export type SearchDepth = "standard" | "heavy";

export type SearchSpec = {
  id: string;
  region: Region;
  places: string;
  focus: string;
  depth: SearchDepth;
  location: {
    country: string;
    region: string;
    city: string;
  };
};

export type Source = {
  title: string;
  url: string;
  date: string | null;
};

export type Lead = {
  title: string;
  type: VenueType;
  status: VenueStatus;
  expectedOpening: string;
  lastActivityDate: string;
  city: string;
  note: string;
  region: Region;
  sources: Source[];
};

export type SearchFailure = {
  id: string;
  region: Region;
  places: string;
  message: string;
};

export type Period = {
  year: number;
  month: number;
  key: string;
  title: string;
  rangeLabel: string;
  searchAfter: string;
  searchBefore: string;
};
