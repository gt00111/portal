// renderer/components/MergeDropArea.jsx
import ConvertButton from "./ConvertButton";
import CancelButton from "./CancelButton";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import "./style/droparea.css"
import "./style/filelist.css"

export default function MergeDropArea({
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

      const filePaths = await window.electronAPI.selectMargePDF();
      if (filePaths && filePaths.length > 0) {
        const files = filePaths.map((path) => ({
          name: path.split(/[\\/]/).pop(),
          path,
        }));
        onFileSelect((prev) => [...prev, ...files]);
      }
    } catch (error) {
      console.error('ファイル選択エラー:', error);
      alert('ファイルの選択に失敗しました: ' + error.message);
    }
  };

  // ドラッグ後に並び替え
  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = Array.from(selectedFile);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    onFileSelect(reordered);
  };

  // 選択ファイルの単体削除処理
  const handleRemoveFile = async (indexToRemove) => {
    const fileToDelete = selectedFile[indexToRemove];
    // バックエンド側の一時ファイル削除
    await window.electronAPI.deleteTempFile?.(fileToDelete.path);
    const updated = selectedFile.filter((_, index) => index !== indexToRemove);
    onFileSelect(updated);
  };

  // ファイル名でソート（昇順）
  const handleSortAscending = () => {
    const sorted = [...selectedFile].sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      return nameA.localeCompare(nameB, 'ja');
    });
    onFileSelect(sorted);
  };

  // ファイル名でソート（降順）
  const handleSortDescending = () => {
    const sorted = [...selectedFile].sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      return nameB.localeCompare(nameA, 'ja');
    });
    onFileSelect(sorted);
  };

  return (
    <div 
      className="drop-area"
    >
      <p>連結するPDFファイルを追加してください</p>
      <button onClick={handleSelectFile} className="button-base btn-select">
        ファイルの追加
      </button>

      {selectedFile && selectedFile.length > 0 && (
        <>
          <div style={{ marginTop: "20px", textAlign: "center" }}>
            <p><strong>＜選択されたファイル＞</strong></p>
            
            {/* ソートボタン */}
            {selectedFile.length > 1 && (
              <div style={{ 
                marginBottom: "16px", 
                display: "flex", 
                gap: "8px", 
                justifyContent: "center",
                flexWrap: "wrap"
              }}>
                <button
                  onClick={handleSortAscending}
                  className="button-base btn-sort"
                  title="ファイル名で昇順に並び替え"
                >
                  ↑ 昇順
                </button>
                <button
                  onClick={handleSortDescending}
                  className="button-base btn-sort"
                  title="ファイル名で降順に並び替え"
                >
                  ↓ 降順
                </button>
              </div>
            )}

            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="file-list">
                {(provided) => (
                  <ul
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="file-list"
                  >
                    {selectedFile.map((file, index) => {
                      const safeId = (file && typeof file.path === "string" && file.path.length > 0)
                        ? file.path
                        : `${file?.name || "file"}-${index}`;
                      return (
                        <Draggable
                          key={safeId}
                          draggableId={safeId}
                          index={index}
                        >
                          {(provided) => (
                            <li
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className="file-item"
                            >
                              <span className="file-item-name">{file.name}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveFile(index);
                                }}
                                className="file-remove-button"
                                title="削除"
                                aria-label="ファイルを削除"
                              >
                                ×
                              </button>
                            </li>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </ul>
                )}
              </Droppable>
            </DragDropContext>
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
