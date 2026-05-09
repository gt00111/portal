// renderer/components/ConvertButton.jsx
import SaveButton from "./SaveButton";
import CancelButton from "./CancelButton";
import "./style/buttons.css"

export default function ConvertButton({ onClick, isConverted, onSave, onCancel, disabled = false }) {
  return (
    <div className="button-group">
      {!isConverted ? (
        <>
          <button 
            className="button-base btn-convert" 
            onClick={onClick}
            disabled={disabled}
          >
            変換開始
          </button>
          {onCancel && (
            <CancelButton onClick={onCancel} />
          )}
        </>
      ) : (
        <>
          <SaveButton onClick={onSave} />
          {onCancel && (
            <CancelButton onClick={onCancel} />
          )}
        </>
      )}
    </div>
  );
}
