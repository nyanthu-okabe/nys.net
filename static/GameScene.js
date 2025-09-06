import { Block } from "./block.js";

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });
    this.looking_x = 0;
    this.looking_y = 0;
    this.speed_x = 0;
    this.speed_y = 0;
    this.now_users = [];
    this.userBlocks = {}; // uid -> Block インスタンス
    this.lastSentPosition = { x: null, y: null };
  }

  preload() {}

  create() {
    const BLOCK_SIZE = 50;
    const cols = Math.ceil(this.scale.width / BLOCK_SIZE);
    const rows = Math.ceil(this.scale.height / BLOCK_SIZE);

    // 2次元配列でブロック管理
    this.blocks = Array.from({ length: rows }, () => Array(cols).fill(null));

    // プレイヤーを画面中央に配置
    this.player = new Block(
      this,
      Math.floor(cols / 2) * BLOCK_SIZE + BLOCK_SIZE / 2,
      Math.floor(rows / 2) * BLOCK_SIZE + BLOCK_SIZE / 2,
      0xffaa00,
    );

    this.cursors = this.input.keyboard.createCursorKeys();

    // 下半分の地面ブロックを生成
    for (let j = 13; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if (i == 12 && j >= 15) continue;
        const blk = new Block(
          this,
          i * BLOCK_SIZE + BLOCK_SIZE / 2,
          j * BLOCK_SIZE + BLOCK_SIZE / 2,
        );
        this.blocks[j][i] = blk;
      }
    }

    // 衝突判定テキスト
    this.collisionText = this.add.text(10, 10, "", {
      font: "20px Arial",
      fill: "#ffffff",
    });

    // 1秒ごとに他ユーザー情報を取得
    this.time.addEvent({
      delay: 1000,
      callback: this.fetchActiveUsers,
      callbackScope: this,
      loop: true,
    });
  }

  fetchActiveUsers() {
    fetch("/demo_client")
      .then((res) => res.json())
      .then((users) => {
        this.now_users = users;
        // console.log("現在の接続ユーザー:", users);
      })
      .catch((err) => {
        console.error("ユーザー取得失敗:", err);
      });
  }

  sendMyPosition(x, y) {
    fetch("/update_position", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x, y }),
    })
      .then((res) => {
        if (!res.ok) {
          console.error("Failed to send position:", res.statusText);
        }
      })
      .catch((err) => {
        console.error("Error sending position:", err);
      });
  }

  update() {
    const BLOCK_SIZE = 50;

    // 入力
    if (this.cursors.left.isDown) this.speed_x += 3;
    if (this.cursors.right.isDown) this.speed_x -= 3;
    if (this.cursors.up.isDown) this.speed_y += 3;
    if (this.cursors.down.isDown) this.speed_y -= 3;

    // 摩擦（小さくなったらゼロにする）
    this.speed_x *= 0.92;
    this.speed_y *= 0.92;
    if (Math.abs(this.speed_x) < 0.01) this.speed_x = 0;
    if (Math.abs(this.speed_y) < 0.01) this.speed_y = 0;

    // 画面中央（プレイヤー固定）
    const px = this.scale.width / 2;
    const py = this.scale.height / 2;

    const rows = this.blocks.length;
    const cols = this.blocks[0].length;

    // プレイヤーの半寸法（描画と同じサイズ前提）
    const halfW = BLOCK_SIZE / 2;
    const halfH = BLOCK_SIZE / 2;

    // ヘルパー： AABB を作る
    const makeAABB = (cx, cy, hw, hh) => ({
      left: cx - hw,
      right: cx + hw,
      top: cy - hh,
      bottom: cy + hh,
    });

    // ワールド座標系について:
    // block の world center = (i+0.5)*BLOCK_SIZE, (j+0.5)*BLOCK_SIZE
    // block の AABB left = i*BLOCK_SIZE, right = (i+1)*BLOCK_SIZE, top = j*BLOCK_SIZE, bottom = (j+1)*BLOCK_SIZE

    // 指定したプレイヤーAABB（world座標）と重なるブロックがあるか調べる
    const aabbIntersectsBlocks = (aabb) => {
      // 対象タイル範囲を計算（world座標 -> タイルインデックス）
      const minI = Math.max(0, Math.floor(aabb.left / BLOCK_SIZE));
      const maxI = Math.min(
        cols - 1,
        Math.floor((aabb.right - 1e-6) / BLOCK_SIZE),
      );
      const minJ = Math.max(0, Math.floor(aabb.top / BLOCK_SIZE));
      const maxJ = Math.min(
        rows - 1,
        Math.floor((aabb.bottom - 1e-6) / BLOCK_SIZE),
      );

      for (let j = minJ; j <= maxJ; j++) {
        for (let i = minI; i <= maxI; i++) {
          const blk = this.blocks[j][i];
          if (!blk) continue;
          // ブロックAABB（world座標）
          const bLeft = i * BLOCK_SIZE;
          const bRight = (i + 1) * BLOCK_SIZE;
          const bTop = j * BLOCK_SIZE;
          const bBottom = (j + 1) * BLOCK_SIZE;

          // AABB vs AABB 衝突判定
          if (
            !(
              aabb.right <= bLeft ||
              aabb.left >= bRight ||
              aabb.bottom <= bTop ||
              aabb.top >= bBottom
            )
          ) {
            return true;
          }
        }
      }
      return false;
    };

    // --- X 軸だけ適用して当たり判定 ---
    const tryLookingX = this.looking_x + this.speed_x;
    // プレイヤーの world 中心 = screen_center - looking
    const playerWorldX_ifX = px - tryLookingX;
    const playerWorldY_now = py - this.looking_y;
    const playerAABB_X = makeAABB(
      playerWorldX_ifX,
      playerWorldY_now,
      halfW,
      halfH,
    );

    let collidedX = aabbIntersectsBlocks(playerAABB_X);
    if (collidedX) {
      this.speed_x = 0;
      // looking_x は変更しない（X移動キャンセル）
    } else {
      this.looking_x = tryLookingX;
    }

    // --- Y 軸だけ適用して当たり判定 ---
    const tryLookingY = this.looking_y + this.speed_y;
    const playerWorldX_now = px - this.looking_x; // note: looking_x は上で更新済みかそのまま
    const playerWorldY_ifY = py - tryLookingY;
    const playerAABB_Y = makeAABB(
      playerWorldX_now,
      playerWorldY_ifY,
      halfW,
      halfH,
    );

    let collidedY = aabbIntersectsBlocks(playerAABB_Y);
    if (collidedY) {
      this.speed_y = 0;
      // looking_y は変更しない（Y移動キャンセル）
    } else {
      this.looking_y = tryLookingY;
    }

    // Send position to server if it changed significantly
    if (
      Math.abs(this.looking_x - this.lastSentPosition.x) > 1 ||
      Math.abs(this.looking_y - this.lastSentPosition.y) > 1
    ) {
      this.sendMyPosition(this.looking_x, this.looking_y);
      this.lastSentPosition.x = this.looking_x;
      this.lastSentPosition.y = this.looking_y;
    }

    // Update other users' blocks
    const activeUserIds = new Set();
    this.now_users.forEach((user) => {
      activeUserIds.add(user.id);
      let userBlock = this.userBlocks[user.id];
      if (!userBlock) {
        // Create new block for new user
        userBlock = new Block(this, 0, 0, 0x00ffaa); // Different color for other users
        this.userBlocks[user.id] = userBlock;
      }
      // Update position relative to player's looking position
      userBlock.setPosition(px - (user.x - this.looking_x), py - (user.y - this.looking_y));
    });

    // Remove blocks for users who are no longer active
    for (const userId in this.userBlocks) {
      if (!activeUserIds.has(userId)) {
        this.userBlocks[userId].destroy();
        delete this.userBlocks[userId];
      }
    }

    // デバッグ表示
    this.collisionText.setText(
      `DebugInfo:\ncol{ x:${collidedX}, y:${collidedY}}\nplayer { x:${this.looking_x}, y:${this.looking_y}}\nspeed{ x:${this.speed_x}, y:${this.speed_y}}\nUsers: ${this.now_users.length}`,
    );

    // ブロック描画更新（world -> screen : worldCenter + looking -> setPosition）
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const blk = this.blocks[j][i];
        if (!blk) continue;
        const worldX = i * BLOCK_SIZE + BLOCK_SIZE / 2;
        const worldY = j * BLOCK_SIZE + BLOCK_SIZE / 2;
        blk.setPosition(worldX + this.looking_x, worldY + this.looking_y);
      }
    }

    // プレイヤーは画面中央固定
    this.player.setPosition(px, py);
  }
}
