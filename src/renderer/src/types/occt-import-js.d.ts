declare module "occt-import-js" {
  export interface OcctAttributeArray {
    array: number[];
  }

  export interface OcctMesh {
    name?: string;
    attributes: {
      position: OcctAttributeArray;
      normal?: OcctAttributeArray;
    };
    index: OcctAttributeArray;
    color?: [number, number, number];
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
