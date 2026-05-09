// renderer/components/ConvertDropArea.jsx
import FormatSelector from "./FormatSelector";
import ConvertButton from "./ConvertButton";
import CancelButton from "./CancelButton";
import "./style/droparea.css"
import "./style/filelist.css"

export default function ConvertDropArea({
  selectedFile,
  onFileSelect,
  selectedFormat,
  onFormatChange,
  onConvert,
  onSave,
  onCancel,
  isConverted,
}) {
  const handleSelectFile = async () => {
    try {
      // electronAPIが利用可能か確認
      if (!window.electronAPI) {
        console.error('❌ window.electronAPIが利用できません。preloadスクリプトが読み込まれていない可能性があります。');
        alert('エラー: アプリケーションの初期化に失敗しました。ページを再読み込みしてください。');
        return;
      }

      const filePaths = await window.electronAPI.selectPDF(); // ← preload経由で呼び出し
      if (filePaths && filePaths.length > 0) {
        const files = filePaths.map((path) => ({
          name: path.split(/[\\/]/).pop(),
          path,
        }));
        onFileSelect(files);
      }
    } catch (error) {
      console.error('ファイル選択エラー:', error);
      alert('ファイルの選択に失敗しました: ' + error.message);
    }
  };

  return (
     <div 
       className="drop-area"
     >
      <p>PDFファイルを選択してください（複数可）</p>
      <button onClick={handleSelectFile} className="button-base btn-select">
        ファイルを選択
      </button>

      {selectedFile && selectedFile.length > 0 && (
        <>
          <div style={{ marginTop: "20px", textAlign: "center" }}>
            <p><strong>＜選択されたファイル＞</strong></p>
            <ul className="file-list">
              {selectedFile.map((file, index) => (
                <li key={index} className="file-item">{file.name}</li>
              ))}
            </ul>
          </div>

          <FormatSelector
            selectedFormat={selectedFormat}
            onChange={onFormatChange}
          />
          <ConvertButton
            onClick={onConvert}
            onSave={onSave}
            onCancel={onCancel}
            isConverted={isConverted}
          />
        </>
      )}
    </div>
  );
}