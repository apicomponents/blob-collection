//@flow
export type DocWithEtag = {
  _id: string,
  _etag: string,
  [string]: any
};

export type View = {
  version: string,
  map: ({}, {}) => {},
  filter: ({}) => boolean
};
