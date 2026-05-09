// renderer/components/CancelButton.jsx

export default function CancelButton({ onClick }) {
  return (
    <button className="button-base btn-cancel" onClick={onClick}>
      キャンセル
    </button>
  );
}