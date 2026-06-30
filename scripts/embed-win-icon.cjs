const path = require("node:path");
const rcedit = require("rcedit");

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const { packager, appOutDir } = context;
  const exePath = path.join(appOutDir, `${packager.appInfo.productFilename}.exe`);
  const iconPath = path.join(packager.projectDir, "resources/branding/portal/icon.ico");

  await rcedit(exePath, { icon: iconPath });
};
