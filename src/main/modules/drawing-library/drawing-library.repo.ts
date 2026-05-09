import type { ProjectFileWithProject } from "@shared/seisan/projectFile.js";

import { listAllWithProject } from "@main/seisan/repos/projectFiles.repo.js";

export function listSeisanCustomerDrawings(): ProjectFileWithProject[] {
  return listAllWithProject();
}
