import { Block } from "./block.js";

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });
  }

  preload() {}

  create() {
    this.blocks = [];
    this.createBlocks();

    // ウィンドウリサイズ対応
    this.scale.on("resize", (gameSize) => {
      this.clearBlocks();
      this.createBlocks(gameSize.width, gameSize.height);
    });
  }

  update() {}

  createBlocks(width = this.scale.width, height = this.scale.height) {
    const BLOCK_SIZE = 50;
    const cols = Math.ceil(width / BLOCK_SIZE);
    const rows = Math.ceil(height / BLOCK_SIZE);

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        this.blocks.push(
          new Block(
            this,
            i * BLOCK_SIZE + BLOCK_SIZE / 2,
            j * BLOCK_SIZE + BLOCK_SIZE / 2,
          ),
        );
      }
    }
  }

  clearBlocks() {
    this.blocks.forEach((block) => block.destroy());
    this.blocks = [];
  }
}

const config = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: "#222",
  scene: [GameScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

const game = new Phaser.Game(config);
