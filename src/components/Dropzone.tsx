import { useRef, useState } from "react";

interface Props {
  disabled: boolean;
  onFileSelected: (file: File) => void;
}

export function Dropzone({ disabled, onFileSelected }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (files && files.length > 0) onFileSelected(files[0]);
  };

  return (
    <section className="card">
      <div
        className={`dropzone${dragOver ? " dragover" : ""}${disabled ? " disabled" : ""}`}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled) handleFiles(e.dataTransfer.files);
        }}
      >
        <p>拖曳音檔到這裡，或點擊選擇檔案</p>
        <p className="hint">支援 mp3 / wav / m4a 等常見格式，長錄音會自動切段處理</p>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          hidden
          disabled={disabled}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    </section>
  );
}
