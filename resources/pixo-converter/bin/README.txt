Poppler バイナリ配置用（Windows 例）

PDF を画像へ変換する処理で pdftoppm を呼び出します。

優先順位:
1. resources/tools/poppler-*/Library/bin（例: poppler-25.07.0）
2. resources/pixo-converter/bin
3. PATH 上の pdftoppm

このフォルダ（pixo-converter/bin）を使う場合の配置:

- pdftoppm.exe（および Poppler が要求する同梱 DLL）

開発時はリポジトリ直下からの相対パス:

  resources/pixo-converter/bin/pdftoppm.exe

配布パッケージでは app.asar 外の resources に同梱されます（electron-builder の files に resources/**/* が含まれる前提）。
resources/tools は extraResources でインストール先の resources/tools にコピーされます。

Poppler の入手: https://github.com/oschwartz10612/poppler-windows 等の公式・ミラーから入手し、bin 相当のファイルをこのディレクトリにコピーしてください。
