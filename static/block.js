const BLOCK_SIZE = 50;

export class Block {
  constructor(scene, x, y, color = 0x44aa88) {
    this.scene = scene;
    // 左上基準にする（幅高さは BLOCK_SIZE）
    this.rect = scene.add
      .rectangle(x, y, BLOCK_SIZE, BLOCK_SIZE, color)
      .setStrokeStyle(2, 0x000000)
      .setOrigin(0, 0);

    this.originalX = x;
    this.originalY = y;
  }

  setPosition(x, y) {
    this.rect.setPosition(Math.round(x), Math.round(y));
  }

  destroy() {
    this.rect.destroy();
  }
}
