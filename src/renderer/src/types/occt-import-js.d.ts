declare module "occt-import-js" {
  export interface OcctAttributeArray {
    array: number[];
  }

  /** 元の BREP 面と三角形範囲の対応（first/last は三角形インデックス・両端含む） */
  export interface OcctBrepFace {
    first: number;
    last: number;
    color?: [number, number, number];
  }

  export interface OcctMesh {
    name?: string;
    attributes: {
      position: OcctAttributeArray;
      normal?: OcctAttributeArray;
    };
    index: OcctAttributeArray;
    color?: [number, number, number];
    brep_faces?: OcctBrepFace[];
  }

  export interface OcctReadResult {
    success: boolean;
    root?: unknown;
    meshes: OcctMesh[];
  }

  export interface OcctModule {
    ReadStepFile(content: Uint8Array, params: unknown): OcctReadResult;
    ReadBrepFile(content: Uint8Array, params: unknown): OcctReadResult;
    ReadIgesFile(content: Uint8Array, params: unknown): OcctReadResult;
  }

  export interface OcctFactoryOptions {
    locateFile?: (path: string) => string;
  }

  const occtimportjs: (options?: OcctFactoryOptions) => Promise<OcctModule>;
  export default occtimportjs;
}
