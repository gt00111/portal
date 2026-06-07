import { Route, Routes } from "react-router-dom";

import type { SessionUser } from "@shared/types.js";

import { PartsTrackerApp } from "@renderer/routes/PartsTrackerApp.js";
import { PartsTrackerComparePage } from "@renderer/routes/PartsTrackerComparePage.js";
import { PartsTrackerHistoryPage } from "@renderer/routes/PartsTrackerHistoryPage.js";
import { PartsTrackerLayout } from "@renderer/routes/parts-tracker/PartsTrackerLayout.js";

interface Props {
  session: SessionUser;
}

export function PartsTrackerRoutes({ session }: Props): JSX.Element {
  return (
    <Routes>
      <Route element={<PartsTrackerLayout session={session} />}>
        <Route index element={<PartsTrackerApp session={session} />} />
        <Route path="compare" element={<PartsTrackerComparePage session={session} />} />
        <Route path="history" element={<PartsTrackerHistoryPage session={session} />} />
      </Route>
    </Routes>
  );
}
