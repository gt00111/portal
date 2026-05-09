// renderer/components/TiffDropArea.jsx
import ConvertButton from "./ConvertButton";
import CancelButton from "./CancelButton";
import "./style/droparea.css"
import "./style/filelist.css"

export default function TiffDropArea({
  selectedFile,
  onFileSelect,
  onConvert,
  onSave,
  onCancel,
  isConverted,
}) {
  const handleSelectFile = async () => {
    try {
      if (!window.electronAPI) {
        console.error('❌ window.electronAPIが利用できません。');
        alert('エラー: アプリケーションの初期化に失敗しました。ページを再読み込みしてください。');
        return;
      }

      const filePaths = await window.electronAPI.selectTIFF(); // ← TIFF用
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
      <p>TIFFファイルを選択してください（複数可）</p>
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
