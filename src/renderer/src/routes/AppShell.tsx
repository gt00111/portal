import { Navigate, useParams } from "react-router-dom";

import type { SessionUser } from "@shared/types.js";

import { MasterDatabase } from "@renderer/routes/MasterDatabase.js";
import { NotFound } from "@renderer/routes/NotFound.js";

interface Props {
  session: SessionUser;
}

const REGISTRY: Record<string, React.ComponentType<{ session: SessionUser }>> = {
  "master-database": MasterDatabase,
};

export function AppShell({ session }: Props): JSX.Element {
  const { appId } = useParams<{ appId: string }>();
  if (!appId) return <Navigate to="/home" replace />;
  const Comp = REGISTRY[appId];
  if (!Comp) return <NotFound />;
  return (
    <div className="min-h-screen bg-bg-base">
      <div className="mx-auto max-w-6xl p-6">
        <Comp session={session} />
      </div>
    </div>
  );
}
