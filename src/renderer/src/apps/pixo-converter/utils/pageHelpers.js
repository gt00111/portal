// renderer/utils/pageHelpers.js

/**
 * ページの状態をリセットする共通関数
 * @param {Object} setters - 各setState関数を含むオブジェクト
 */
export function resetPageState(setters) {
  const {
    setFiles = null,
    setConvertedFiles = null,
    setIsConverted = null,
    setFormat = null,
  } = setters;

  if (setFiles) setFiles([]);
  if (setConvertedFiles) setConvertedFiles([]);
  if (setIsConverted) setIsConverted(false);
  if (setFormat) setFormat("png");
}

