$content = Get-Content "D:\datagate-poc\api\files\download.js" -Encoding UTF8 -Raw
# バッククォート（ASCII 96）を括弧に置換
$content = $content -replace ([char]96 + 'file:'), '(`file:'
$content | Set-Content "D:\datagate-poc\api\files\download.js" -Encoding UTF8 -NoNewline
