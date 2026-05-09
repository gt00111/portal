// renderer/compornents/FormatSelector.jsx
import "./style/selector.css"

const formats = [
  { value: "png", label: "PNG" },
  { value: "jpg", label: "JPG" },
];

export default function FormatSelector({ selectedFormat, onChange }) {
  return (
    <div className="selector-wrapper">
      <p><strong>＜変換フォーマットを選択＞</strong></p>

      <div className="selector-options">
        {formats.map((format) => (
          <button
            key={format.value}
            onClick={() => onChange(format.value)}
            className={`selector-button ${
              selectedFormat === format.value ? "selected" : ""
            }`}
          >
            {format.label}
          </button>
        ))}
      </div>
    </div>
  );
}