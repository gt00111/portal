# 図面比較ツール（compare_drawings.exe）

ポータルの「PDF比較（おまけ）」は、ここに **`compare_drawings.exe`** があると **Python なし**で動きます。

## ビルド手順（Windows・PyInstaller・例）

`compare_drawings.py` と PyInstaller 用 `.spec` をお持ちの場合は、次のように **exe を生成**してこのフォルダ（`resources/tools/compare_drawings.exe`）へコピーします。

```powershell
cd <compare_drawings.py があるディレクトリ>
py -m pip install pyinstaller pdf2image opencv-python-headless numpy pillow
pyinstaller compare_drawings.spec
```

生成された `dist/compare_drawings.exe` を **`resources/tools/compare_drawings.exe`** にコピー（この README と同じディレクトリ）。

Poppler は exe ビルド時の仕様に従い、exe と同じディレクトリ構成（`poppler-25.07.0\Library\bin` 等）で渡すか、実行 PC の環境変数 `POPPLER_PATH` で指定してください。

## この `resources/tools/` とポータルパッケージ

`package.json` の **`build.files`** に **`!resources/tools/**/*`** があるのは、**大きな exe を app.asar に詰め込まない**ためです。代わりに **`build.extraResources`** で **`resources/tools` → インストール先の `resources/tools`** へそのままコピーされます。

**このディレクトリに実在するファイルだけ**が配布物に入ります。ランタイムではメイン側が `process.resourcesPath/tools/...` を参照します。

---

## Poppler（内蔵 PixoConverter 用・PDF→画像）

ポータル内蔵の **PixoConverter** が `pdftoppm` を呼び出します。次のいずれかに **`pdftoppm`（Windows では `pdftoppm.exe`）と同梱 DLL** を置いてください。

- **`resources/tools/poppler-*/Library/bin`**（例: この README と同じ `tools` 配下の `poppler-25.07.0`）
- または **`resources/pixo-converter/bin`**

配布時も `extraResources` で `resources/tools` ごとコピーされるため、上記 Poppler ツリーがインストール先の `resources/tools/...` から解決されます。

## 代替

- 環境変数 **`DRAWING_COMPARE_EXE`** に exe の絶対パスを設定しても読み込みます（このフォルダより優先）。
