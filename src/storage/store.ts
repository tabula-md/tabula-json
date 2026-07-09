export type JsonShareMetadata = {
  createdAt: Date;
};

export type JsonShareListEntry = JsonShareMetadata & {
  jsonId: string;
};

export type JsonShareStore = {
  deleteJsonShare?: (jsonId: string) => Promise<void>;
  getJsonShare: (jsonId: string) => Promise<Buffer | null>;
  getJsonShareMetadata?: (jsonId: string) => Promise<JsonShareMetadata | null>;
  hasJsonShare?: (jsonId: string) => Promise<boolean>;
  listJsonShares?: () => Promise<JsonShareListEntry[]>;
  writeJsonShare: (jsonId: string, snapshot: Buffer) => Promise<void>;
};
