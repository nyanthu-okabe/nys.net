export class Block {
  constructor(scene, x, y, color = 0x44aa88) {
    this.scene = scene;
    this.rect = scene.add
      .rectangle(x, y, 50, 50, color)
      .setStrokeStyle(2, 0x000000);
  }

  destroy() {
    this.rect.destroy();
  }
}
