# 面の在庫

新しく作った面の置き場。まだ本編(`warehouse/levels.json`)には入れていない候補。

- `deep-*.json` … `tools/gen-deep.js` で作った深い面(45手以上)
- `mid-*.json`  … `tools/gen-hard.js` で作った中くらいの面(22手以上)

**必ずここに置いて、1巡ごとにコミットすること。**
`/tmp` に置いていたら、131面ぶんの採取が消えた。この環境では、
コミットしていないものは残らないと考えたほうがよい。

組み上げは `node tools/build-1000.js tools/stock`。
