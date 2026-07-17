# Unity移植メモ

## 共通化するもの

ブラウザのJavaScript自体は移植せず、次のJSONを共通仕様にします。

1. `maze.json`
2. `visual-profile.json`

## 迷路JSON

`grid[z][x]` の文字を読みます。

- `#`：壁
- `.`：通路
- `S`：開始位置
- `G`：ゴール

Unityでは各セルを以下の座標へ置きます。

```csharp
worldX = (x - (size - 1) / 2f) * cellSize;
worldZ = (z - (size - 1) / 2f) * cellSize;
```

方向は次の順序です。

```text
0 north = -Z
1 east  = +X
2 south = +Z
3 west  = -X
```

操作仕様：

- 前進・後退：1セル単位
- 左右：90度単位
- 表示だけ時間補間
- 壁判定は移動先セルが `#` かどうか

## 見栄えJSON

値の意味は共通ですが、Babylon.jsとUnity URPでは数値尺度が一致しません。Unity側の変換レイヤーで調整します。

対応例：

- `materials.wallRoughness` → URP Lit Smoothness = `1 - roughness`
- `materials.floorMetallic` → URP Lit Metallic
- `lighting.ledColor` → Emission Color
- `lighting.ledIntensity` → HDR Emission倍率
- `post.exposure` → Volume Color Adjustments / Post Exposure
- `post.bloom` → Volume Bloom / Intensity
- `post.fogDensity` → Unity側Fog設定へ変換
- `camera.fov` → Camera.fieldOfView
- `camera.moveMs`, `turnMs` → Tween時間

## 推奨Unity構成

```text
Assets/
  SharedData/
    maze.json
    visual-profile.json
  Scripts/
    MazeData.cs
    VisualProfile.cs
    MazeLoader.cs
    MazeBuilder.cs
    GridPlayerController.cs
    LookProfileApplier.cs
  Prefabs/
    Wall.prefab
    LightStrip.prefab
    Goal.prefab
```

最初のUnity版では、ブラウザ版と同じ単純なBox形状をスクリプト生成し、最後にPrefab・テクスチャ・URP Volumeだけを差し替えるのが安全です。
