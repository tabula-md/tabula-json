export type JsonShareStore = {
  getJsonShare: (jsonId: string) => Promise<Buffer | null>;
  writeJsonShare: (jsonId: string, snapshot: Buffer) => Promise<void>;
};
