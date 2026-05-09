// renderer/components/SaveButton.jsx
import './style/buttons.css';

export default function SaveButton({ onClick }) {
  return (
    <button className="button-base btn-save" onClick={onClick}>
      保存
    </button>
  );
}
