\# JP Encoding Playbook

\- すべて UTF-8（BOMなし）。

\- ダウンロード応答: 

&nbsp; - `Content-Disposition: attachment; filename="fallback.txt"; filename\*=UTF-8''<RFC5987エンコード>`

\- PowerShell: テキストI/Oは `-Encoding utf8`、DLは `-OutFile` を使用。

\- Git/Editor: `.gitattributes` で `\*.md text eol=lf`、EditorはUTF-8固定。

\- 自動テストに「日本語ファイル名/絵文字/長拡張子」を常設。



