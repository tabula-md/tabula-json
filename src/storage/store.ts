export type JsonShareStore = {
  getJsonShare: (jsonId: string) => Promise<Buffer | null>;
  hasJsonShare?: (jsonId: string) => Promise<boolean>;
  writeJsonShare: (jsonId: string, snapshot: Buffer) => Promise<void>;
};
