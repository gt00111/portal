import { SkuCrud } from "@renderer/components/SkuCrud.js";
import { useMasterContext } from "@renderer/routes/MasterDatabase.js";

export function SkuRoute(): JSX.Element {
  const ctx = useMasterContext();
  return <SkuCrud canWrite={ctx.canWrite} />;
}
