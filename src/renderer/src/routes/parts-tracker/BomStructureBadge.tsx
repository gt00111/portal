/** 親品番行（サブ組立）の「構造」列バッジ — §8.5.19 B案 */

interface Props {
  isParent: boolean;
}

export function BomStructureBadge({ isParent }: Props): JSX.Element | null {
  if (!isParent) return null;
  return (
    <span
      className="inline-flex rounded px-1.5 py-0 text-[10px] font-medium leading-tight text-accent-primary bg-accent-primary/15"
      title="子部品を持つ組立行"
    >
      組立
    </span>
  );
}
